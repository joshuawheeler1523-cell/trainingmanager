import "server-only";

/**
 * Thin wrapper around the Vercel Domains API used by the agency custom-domain
 * flow (White-Label Phase 3).
 *
 * Auth: Vercel personal access token via `VERCEL_API_TOKEN`.
 * Project scoping: every domain is added to a single Vercel project owned by
 * Arbor; identified by `VERCEL_PROJECT_ID`. Optional `VERCEL_TEAM_ID` for
 * team-owned projects.
 *
 * Degraded mode: when VERCEL_API_TOKEN is not set (typical in local dev), the
 * functions return a `degraded: true` result so the UI can show DNS
 * instructions but skip the actual API call. The agency_admin can still mark
 * the domain as verified manually for testing — but in production the env
 * vars MUST be set or verification will never succeed.
 *
 * Docs: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
 *       https://vercel.com/docs/rest-api/endpoints/projects#verify-project-domain
 */

const VERCEL_API_BASE = "https://api.vercel.com";

type DegradedResult<T> =
  | { ok: true; degraded: false; data: T }
  | { ok: true; degraded: true }
  | { ok: false; error: { code: string; message: string } };

function authHeader(): string | null {
  const token = process.env["VERCEL_API_TOKEN"];
  return token ? `Bearer ${token}` : null;
}

function projectId(): string | null {
  return process.env["VERCEL_PROJECT_ID"] ?? null;
}

function teamQuery(): string {
  const teamId = process.env["VERCEL_TEAM_ID"];
  return teamId ? `?teamId=${teamId}` : "";
}

export type AddDomainResult = {
  name: string;
  verified: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason: string }>;
};

/**
 * Adds `domain` to the Arbor Vercel project. Vercel returns the verification
 * record(s) the user must set in DNS (CNAME for subdomains, TXT for ownership
 * proof if the host hasn't pointed CNAME at vercel-dns.com yet).
 */
export async function vercelAddDomain(domain: string): Promise<DegradedResult<AddDomainResult>> {
  const auth = authHeader();
  const project = projectId();
  if (!auth || !project) return { ok: true, degraded: true };

  try {
    const res = await fetch(`${VERCEL_API_BASE}/v10/projects/${project}/domains${teamQuery()}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errCode =
        typeof (json as { error?: { code?: string } }).error?.code === "string"
          ? (json as { error: { code: string } }).error.code
          : `vercel_${res.status.toString()}`;
      const errMsg =
        typeof (json as { error?: { message?: string } }).error?.message === "string"
          ? (json as { error: { message: string } }).error.message
          : `Vercel API returned ${res.status.toString()}`;
      return { ok: false, error: { code: errCode, message: errMsg } };
    }
    return {
      ok: true,
      degraded: false,
      data: json as unknown as AddDomainResult,
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "VERCEL_FETCH_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
    };
  }
}

export type VerifyDomainResult = {
  name: string;
  verified: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason: string }>;
};

/** Asks Vercel to re-check DNS verification status. */
export async function vercelVerifyDomain(
  domain: string,
): Promise<DegradedResult<VerifyDomainResult>> {
  const auth = authHeader();
  const project = projectId();
  if (!auth || !project) return { ok: true, degraded: true };

  try {
    const res = await fetch(
      `${VERCEL_API_BASE}/v9/projects/${project}/domains/${encodeURIComponent(domain)}/verify${teamQuery()}`,
      { method: "POST", headers: { Authorization: auth } },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: `vercel_${res.status.toString()}`,
          message:
            typeof (json as { error?: { message?: string } }).error?.message === "string"
              ? (json as { error: { message: string } }).error.message
              : `Vercel API returned ${res.status.toString()}`,
        },
      };
    }
    return { ok: true, degraded: false, data: json as unknown as VerifyDomainResult };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "VERCEL_FETCH_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
    };
  }
}

/** Removes a domain from the project (used when an agency replaces or detaches their domain). */
export async function vercelRemoveDomain(domain: string): Promise<DegradedResult<true>> {
  const auth = authHeader();
  const project = projectId();
  if (!auth || !project) return { ok: true, degraded: true };

  try {
    const res = await fetch(
      `${VERCEL_API_BASE}/v9/projects/${project}/domains/${encodeURIComponent(domain)}${teamQuery()}`,
      { method: "DELETE", headers: { Authorization: auth } },
    );
    if (!res.ok && res.status !== 404) {
      return {
        ok: false,
        error: {
          code: `vercel_${res.status.toString()}`,
          message: `Vercel returned ${res.status.toString()}`,
        },
      };
    }
    return { ok: true, degraded: false, data: true };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "VERCEL_FETCH_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
    };
  }
}

/**
 * Returns DNS instructions the agency can paste into their registrar. We
 * emit two: a CNAME (for subdomains) and an A record (for apex). The user
 * picks whichever fits their host.
 */
export function dnsInstructionsFor(domain: string): {
  recordType: "CNAME" | "A";
  host: string;
  value: string;
  note: string;
}[] {
  const isApex = !domain.includes(".") || domain.split(".").length === 2;
  if (isApex) {
    return [
      {
        recordType: "A",
        host: "@",
        value: "76.76.21.21",
        note: "Apex (root) domain — point an A record at Vercel's anycast IP.",
      },
      {
        recordType: "CNAME",
        host: "www",
        value: "cname.vercel-dns.com",
        note: "Optional: CNAME for the www subdomain so www.yourdomain.com also resolves.",
      },
    ];
  }
  const sub = domain.split(".")[0] ?? "app";
  return [
    {
      recordType: "CNAME",
      host: sub,
      value: "cname.vercel-dns.com",
      note: `Subdomain — point a CNAME from "${sub}" to Vercel.`,
    },
  ];
}
