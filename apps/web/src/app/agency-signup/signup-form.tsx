"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createAgencySignupAction } from "./actions";
import { recordLegalAcceptanceAction } from "@/app/legal/actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [done, setDone] = useState<{ email: string; emailSent: boolean } | null>(null);
  // Tracks whether the user has manually edited the slug. Once they have,
  // we stop auto-deriving from the name. The previous closure-based
  // comparison was buggy: it compared against `agencyName` (stale state),
  // so the auto-update raced and broke after the first keystroke.
  const slugManuallyEdited = useRef(false);

  const handleNameChange = (v: string) => {
    setAgencyName(v);
    if (!slugManuallyEdited.current) {
      setAgencySlug(slugify(v));
    }
  };

  const handleSlugChange = (v: string) => {
    slugManuallyEdited.current = true;
    setAgencySlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!acceptedLegal) {
      toast.error("You must accept the legal agreements to continue");
      return;
    }
    startTransition(async () => {
      // Record acceptance keyed by email BEFORE creating the agency, so
      // the audit trail exists even if the user creation fails. The
      // server side recordAcceptance is idempotent so re-recording on a
      // retry is harmless.
      await recordLegalAcceptanceAction({
        documents: ["terms", "privacy", "reseller"],
        email: adminEmail,
        context: "agency_signup",
      });
      const result = await createAgencySignupAction({
        agencyName,
        agencySlug,
        adminEmail,
        adminFullName,
      });
      if (result.ok) {
        setDone({ email: adminEmail, emailSent: result.data.emailSent });
      } else {
        toast.error(result.error.message);
      }
    });
  };

  if (done) {
    return (
      <section className="border-border bg-background space-y-3 rounded-xl border p-8 text-center">
        <p className="text-foreground text-2xl">✓</p>
        <h2 className="text-foreground text-xl font-bold">Agency created</h2>
        <p className="text-muted-foreground text-sm">
          {done.emailSent
            ? `We sent a sign-in link to ${done.email}. Click it to enter your agency console.`
            : `Agency saved, but the magic-link email couldn't be delivered (Resend not configured). Sign in at /login with ${done.email} to continue.`}
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-background space-y-5 rounded-xl border p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="agency-name" className="text-foreground mb-1 block text-sm font-medium">
            Agency name *
          </label>
          <input
            id="agency-name"
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
          <label htmlFor="agency-slug" className="text-foreground mb-1 block text-sm font-medium">
            Slug *
          </label>
          <input
            id="agency-slug"
            type="text"
            required
            value={agencySlug}
            onChange={(e) => {
              handleSlugChange(e.target.value);
            }}
            placeholder="acme-training"
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">Used in URLs. Lowercase + hyphens.</p>
        </div>
      </div>

      <div>
        <label htmlFor="admin-name" className="text-foreground mb-1 block text-sm font-medium">
          Your name *
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
          Your email *
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
        <p className="text-muted-foreground mt-1 text-xs">
          You&apos;ll be the first agency admin. We&apos;ll email a sign-in link here.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={acceptedLegal}
          onChange={(e) => {
            setAcceptedLegal(e.target.checked);
          }}
          className="mt-1 h-4 w-4"
          required
        />
        <span className="text-foreground">
          I agree to the{" "}
          <Link href="/legal/terms" target="_blank" className="text-primary underline">
            Terms of Service
          </Link>
          ,{" "}
          <Link href="/legal/privacy" target="_blank" className="text-primary underline">
            Privacy Policy
          </Link>
          , and{" "}
          <Link href="/legal/reseller-agreement" target="_blank" className="text-primary underline">
            Reseller Agreement
          </Link>{" "}
          on behalf of my agency.
        </span>
      </label>

      <button
        type="submit"
        disabled={
          pending ||
          !agencyName.trim() ||
          !adminEmail.trim() ||
          !adminFullName.trim() ||
          !acceptedLegal
        }
        className="bg-primary text-primary-foreground w-full rounded-md py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating agency…" : "Create agency"}
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
