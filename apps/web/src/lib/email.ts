// Thin Resend client. Per User Guide §13.3 Resend is the org's transactional
// email provider. We don't bundle the official @resend/node SDK — calling
// the REST API directly with fetch is one network round-trip and avoids
// pulling in another dependency that we'd need to keep in sync.
//
// Graceful degrade: when RESEND_API_KEY isn't set (typical in local dev),
// log the would-be email to the server console and return ok. The admin
// UI also surfaces the invite URL alongside each pending invitation so a
// human can copy-paste it manually until the env var is configured.

const RESEND_API_URL = "https://api.resend.com/emails";

// "From" defaults to onboarding@resend.dev which Resend allows on every
// account. Override via RESEND_FROM_EMAIL once the org's verified domain
// is set up.
function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Arbor <onboarding@resend.dev>";
}

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null; degraded: boolean }
  | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Degraded mode — log + return success so calling actions don't surface
    // an "email failed" error to the admin in dev.
    console.warn(
      "[email] RESEND_API_KEY not set — skipping send. Subject:",
      args.subject,
      "to:",
      args.to,
    );
    return { ok: true, id: null, degraded: true };
  }

  const body: Record<string, unknown> = {
    from: fromAddress(),
    to: args.to,
    subject: args.subject,
    html: args.html,
  };
  if (args.text) body["text"] = args.text;
  if (args.replyTo) body["reply_to"] = args.replyTo;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: errText || `Resend ${res.status.toString()}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? null, degraded: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

// ── Templates ──────────────────────────────────────────────────────────────
// Tiny inline templates per User Guide §13.3 (the customizable email
// templates feature is deferred). Plain HTML keeps this readable in any
// mail client without needing MJML or react-email.

export function inviteEmailHtml(args: {
  orgName: string;
  inviterName: string | null;
  acceptUrl: string;
}): string {
  const inviter = args.inviterName ?? "An admin";
  const safeOrg = escapeHtml(args.orgName);
  const safeInviter = escapeHtml(inviter);
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <h2 style="font-size:18px;margin:0 0 12px;">${safeInviter} invited you to ${safeOrg}</h2>
      <p style="font-size:14px;line-height:1.5;color:#475569;">
        Click the button below to accept the invitation and sign in. The link is
        valid for 7 days.
      </p>
      <p style="margin:24px 0;">
        <a href="${args.acceptUrl}"
           style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="font-size:12px;color:#64748b;">
        If the button doesn't work, paste this URL into your browser:<br/>
        <a href="${args.acceptUrl}" style="color:#2563eb;word-break:break-all;">${args.acceptUrl}</a>
      </p>
    </div>
  `;
}

export function inviteEmailText(args: {
  orgName: string;
  inviterName: string | null;
  acceptUrl: string;
}): string {
  const inviter = args.inviterName ?? "An admin";
  return [
    `${inviter} invited you to ${args.orgName}.`,
    "",
    "Accept the invitation here (valid for 7 days):",
    args.acceptUrl,
    "",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
