"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAgencyAsArborAdminAction } from "../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function NewAgencyForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [revShare, setRevShare] = useState("30");
  const [paymentTerms, setPaymentTerms] = useState("30");
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
            : `Agency created. Magic-link email failed (Resend not configured) — share /login with ${adminEmail} manually.`,
        );
        router.push(`/arbor/agencies/${result.data.agencyId}`);
      } else {
        toast.error(result.error.message);
      }
    });
  };

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
