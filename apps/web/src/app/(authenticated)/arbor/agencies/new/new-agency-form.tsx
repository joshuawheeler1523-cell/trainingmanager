"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircleIcon, ClipboardIcon } from "@heroicons/react/20/solid";
import { createAgencyAsArborAdminAction } from "../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

type CreatedAgency = {
  agencyId: string;
  agencyName: string;
  adminEmail: string;
  emailSent: boolean;
  signInLink: string | null;
};

export default function NewAgencyForm() {
  const [pending, startTransition] = useTransition();
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [revShare, setRevShare] = useState("30");
  const [paymentTerms, setPaymentTerms] = useState("30");
  const [created, setCreated] = useState<CreatedAgency | null>(null);
  const slugManuallyEdited = useRef(false);

  const handleNameChange = (v: string) => {
    setAgencyName(v);
    if (!slugManuallyEdited.current) {
      setAgencySlug(slugify(v));
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rev = parseFloat(revShare);
    if (!Number.isFinite(rev) || rev < 0 || rev > 100) {
      toast.error("Rev share % must be between 0 and 100");
      return;
    }
    const terms = parseInt(paymentTerms, 10);
    if (!Number.isFinite(terms) || terms < 1 || terms > 180) {
      toast.error("Payment terms must be between 1 and 180 days");
      return;
    }
    startTransition(async () => {
      const result = await createAgencyAsArborAdminAction({
        agencyName,
        agencySlug,
        adminEmail,
        adminFullName,
        revenueSharePct: Math.round(rev * 100),
        paymentTermsDays: terms,
      });
      if (result.ok) {
        toast.success(
          result.data.emailSent
            ? `Agency created. Welcome email sent to ${adminEmail}.`
            : `Agency created. Email failed — copy the sign-in link below.`,
        );
        setCreated({
          agencyId: result.data.agencyId,
          agencyName,
          adminEmail,
          emailSent: result.data.emailSent,
          signInLink: result.data.signInLink,
        });
      } else {
        toast.error(result.error.message);
      }
    });
  };

  if (created) {
    return <AgencyCreatedSuccess created={created} />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-background space-y-5 rounded-xl border p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="text-foreground mb-1 block text-sm font-medium">
            Agency name *
          </label>
          <input
            id="name"
            type="text"
            required
            value={agencyName}
            onChange={(e) => {
              handleNameChange(e.target.value);
            }}
            placeholder="Acme Training Consultants"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="slug" className="text-foreground mb-1 block text-sm font-medium">
            Slug *
          </label>
          <input
            id="slug"
            type="text"
            required
            value={agencySlug}
            onChange={(e) => {
              slugManuallyEdited.current = true;
              setAgencySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }}
            placeholder="acme-training"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="admin-name" className="text-foreground mb-1 block text-sm font-medium">
            Admin full name *
          </label>
          <input
            id="admin-name"
            type="text"
            required
            value={adminFullName}
            onChange={(e) => {
              setAdminFullName(e.target.value);
            }}
            placeholder="Jane Doe"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="admin-email" className="text-foreground mb-1 block text-sm font-medium">
            Admin email *
          </label>
          <input
            id="admin-email"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => {
              setAdminEmail(e.target.value);
            }}
            placeholder="jane@acme-consulting.com"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rev-share" className="text-foreground mb-1 block text-sm font-medium">
            Default rev-share %
          </label>
          <input
            id="rev-share"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={revShare}
            onChange={(e) => {
              setRevShare(e.target.value);
            }}
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">Arbor&apos;s cut. Standard is 30%.</p>
        </div>
        <div>
          <label htmlFor="payment-terms" className="text-foreground mb-1 block text-sm font-medium">
            Payment terms (days)
          </label>
          <input
            id="payment-terms"
            type="number"
            step="1"
            min="1"
            max="180"
            value={paymentTerms}
            onChange={(e) => {
              setPaymentTerms(e.target.value);
            }}
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">Net N from invoice date.</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || !agencyName.trim() || !adminEmail.trim() || !adminFullName.trim()}
        className="bg-primary text-primary-foreground w-full rounded-md py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating agency…" : "Create agency + send welcome email"}
      </button>
    </form>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function AgencyCreatedSuccess({ created }: { created: CreatedAgency }) {
  return (
    <div className="border-border bg-background space-y-5 rounded-xl border p-6">
      <div className="flex items-start gap-3 rounded-lg bg-emerald-50/40 p-4 dark:bg-emerald-950/20">
        <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">
            Agency <span className="font-bold">{created.agencyName}</span> is ready
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {created.emailSent
              ? `A welcome email with a one-click sign-in link was sent to ${created.adminEmail}.`
              : `Email delivery is degraded (Resend not configured). Share the sign-in link below with ${created.adminEmail}.`}
          </p>
        </div>
      </div>

      {created.signInLink && (
        <div>
          <p className="text-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
            Sign-in link{" "}
            {created.emailSent ? "(fallback — same link sent in email)" : "(share with the admin)"}
          </p>
          <div className="border-border bg-surface flex items-center gap-2 rounded-md border p-2 text-xs">
            <code className="text-foreground flex-1 truncate font-mono">{created.signInLink}</code>
            <button
              type="button"
              onClick={() => {
                if (created.signInLink) {
                  void navigator.clipboard.writeText(created.signInLink);
                  toast.success("Link copied");
                }
              }}
              className="border-border text-foreground hover:bg-background inline-flex items-center gap-1 rounded border px-2 py-1"
            >
              <ClipboardIcon className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            One-time magic link. Expires per Supabase&apos;s default (1 hour). After it expires, use
            the user&apos;s page to send a fresh one.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link
          href={`/arbor/agencies/${created.agencyId}`}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Open agency
        </Link>
        <Link
          href="/arbor/agencies"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          All agencies →
        </Link>
      </div>
    </div>
  );
}
