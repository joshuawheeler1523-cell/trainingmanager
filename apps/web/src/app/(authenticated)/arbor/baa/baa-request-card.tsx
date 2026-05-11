"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBaaAction } from "./actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const STATUS = ["requested", "sent", "signed", "rejected", "expired"] as const;

type Baa = {
  id: string;
  org_id: string;
  status: string;
  requested_at: string;
  signer_name: string | null;
  signer_title: string | null;
  signer_email: string | null;
  effective_date: string | null;
  notes: string | null;
};

export default function BaaRequestCard({
  baa,
  org,
}: {
  baa: Baa;
  org: { id: string; name: string; slug: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<(typeof STATUS)[number]>(
    baa.status as (typeof STATUS)[number],
  );
  const [signerName, setSignerName] = useState(baa.signer_name ?? "");
  const [signerTitle, setSignerTitle] = useState(baa.signer_title ?? "");
  const [signerEmail, setSignerEmail] = useState(baa.signer_email ?? "");
  const [effectiveDate, setEffectiveDate] = useState(baa.effective_date ?? "");
  const [notes, setNotes] = useState(baa.notes ?? "");

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateBaaAction({
        baaId: baa.id,
        status,
        signerName,
        signerTitle,
        signerEmail,
        effectiveDate,
        notes,
      });
      if (result.ok) {
        toast.success("BAA updated");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <form
      onSubmit={handleSave}
      className="border-border bg-background space-y-3 rounded-xl border p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/arbor/orgs/${org.id}`}
            className="text-foreground hover:text-primary text-base font-bold"
          >
            {org.name}
          </Link>
          <p className="text-muted-foreground mt-0.5 font-mono text-xs">{org.slug}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Requested {baa.requested_at.replace("T", " ").slice(0, 16)}
          </p>
        </div>
        <span className="text-muted-foreground text-xs capitalize">{baa.status}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as (typeof STATUS)[number]);
            }}
            className={fieldClass}
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Effective date (signed only)
          </label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => {
              setEffectiveDate(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Signer name</label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => {
              setSignerName(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Signer title</label>
          <input
            type="text"
            value={signerTitle}
            onChange={(e) => {
              setSignerTitle(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Signer email</label>
          <input
            type="email"
            value={signerEmail}
            onChange={(e) => {
              setSignerEmail(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label className="text-foreground mb-1 block text-xs font-medium">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          rows={2}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <p className="text-muted-foreground text-xs">
          Upload signed PDF: drop into the <code>baa-documents</code> bucket at{" "}
          <code>{`${baa.org_id}/${baa.id}.pdf`}</code> via Supabase dashboard for v1.
        </p>
      </div>
    </form>
  );
}
