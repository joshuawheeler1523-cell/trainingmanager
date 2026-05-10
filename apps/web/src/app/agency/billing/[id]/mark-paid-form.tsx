"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markInvoicePaidAction } from "../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const METHODS = ["check", "wire", "ach", "zelle", "paypal", "other"] as const;

export default function MarkPaidForm({
  invoiceId,
  totalCents,
}: {
  invoiceId: string;
  totalCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [paidAt, setPaidAt] = useState(today);
  const [paidMethod, setPaidMethod] = useState<(typeof METHODS)[number]>("ach");
  const [paidReference, setPaidReference] = useState("");
  const [paidAmountDollars, setPaidAmountDollars] = useState((totalCents / 100).toFixed(2));
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(paidAmountDollars) * 100);
    startTransition(async () => {
      const result = await markInvoicePaidAction({
        invoiceId,
        paidAt,
        paidMethod,
        paidReference,
        paidAmountCents: cents,
        notes,
      });
      if (result.ok) {
        toast.success("Payment recorded");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="border-border bg-background rounded-xl border p-5">
      <h2 className="text-foreground mb-4 text-base font-bold">Record payment (Arbor admin)</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="paid-at" className="text-foreground mb-1 block text-sm font-medium">
            Paid at *
          </label>
          <input
            id="paid-at"
            type="date"
            required
            value={paidAt}
            onChange={(e) => {
              setPaidAt(e.target.value);
            }}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="method" className="text-foreground mb-1 block text-sm font-medium">
            Method *
          </label>
          <select
            id="method"
            value={paidMethod}
            onChange={(e) => {
              setPaidMethod(e.target.value as (typeof METHODS)[number]);
            }}
            className={fieldClass}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reference" className="text-foreground mb-1 block text-sm font-medium">
            Reference (check #, wire conf, etc.)
          </label>
          <input
            id="reference"
            type="text"
            value={paidReference}
            onChange={(e) => {
              setPaidReference(e.target.value);
            }}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="amount" className="text-foreground mb-1 block text-sm font-medium">
            Amount received (USD)
          </label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={paidAmountDollars}
            onChange={(e) => {
              setPaidAmountDollars(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="notes" className="text-foreground mb-1 block text-sm font-medium">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          className={fieldClass}
        />
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Mark as paid"}
        </button>
      </div>
    </form>
  );
}
