"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { REQUEST_URGENCY_VALUES, type RequestUrgency } from "@arbor/shared";
import { createRequest } from "./actions";

type Props = {
  onClose: () => void;
};

const fieldCls =
  "border-input bg-background text-foreground w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function NewRequestDialog({ onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterDept, setRequesterDept] = useState("");
  const [audience, setAudience] = useState("");
  const [justification, setJustification] = useState("");
  const [urgency, setUrgency] = useState<RequestUrgency>("standard");
  const [targetDate, setTargetDate] = useState("");

  function handleSubmit() {
    if (!title.trim() || !requesterName.trim()) {
      toast.error("Title and requester name are required.");
      return;
    }
    startTransition(async () => {
      const result = await createRequest({
        title: title.trim(),
        requested_by_name: requesterName.trim(),
        requested_by_email: requesterEmail.trim() || null,
        requested_by_department: requesterDept.trim() || null,
        business_justification: justification.trim() || null,
        target_audience: audience.trim() || null,
        urgency,
        target_completion_date: targetDate || null,
      });
      if (result.ok) {
        toast.success("Request added to queue");
        router.refresh();
        onClose();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-foreground text-base font-semibold">
                New training request
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground mt-0.5 text-xs">
                Add a request from inside the platform — useful for phone-in or email asks.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <Field id="nr-title" label="Title *">
              <input
                id="nr-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                placeholder="e.g. EMR refresher for night-shift nurses"
                className={fieldCls}
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="nr-name" label="Requested by *">
                <input
                  id="nr-name"
                  value={requesterName}
                  onChange={(e) => {
                    setRequesterName(e.target.value);
                  }}
                  className={fieldCls}
                />
              </Field>
              <Field id="nr-email" label="Email (optional)">
                <input
                  id="nr-email"
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => {
                    setRequesterEmail(e.target.value);
                  }}
                  className={fieldCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="nr-dept" label="Department (optional)">
                <input
                  id="nr-dept"
                  value={requesterDept}
                  onChange={(e) => {
                    setRequesterDept(e.target.value);
                  }}
                  className={fieldCls}
                />
              </Field>
              <Field id="nr-audience" label="Target audience (optional)">
                <input
                  id="nr-audience"
                  value={audience}
                  onChange={(e) => {
                    setAudience(e.target.value);
                  }}
                  placeholder="e.g. ICU nurses, 24 people"
                  className={fieldCls}
                />
              </Field>
            </div>

            <Field id="nr-justification" label="Business justification (optional)">
              <textarea
                id="nr-justification"
                rows={3}
                value={justification}
                onChange={(e) => {
                  setJustification(e.target.value);
                }}
                className={fieldCls}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="nr-urgency" label="Urgency">
                <select
                  id="nr-urgency"
                  value={urgency}
                  onChange={(e) => {
                    setUrgency(e.target.value as RequestUrgency);
                  }}
                  className={fieldCls + " capitalize"}
                >
                  {REQUEST_URGENCY_VALUES.map((u) => (
                    <option key={u} value={u} className="capitalize">
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="nr-target" label="Target completion date (optional)">
                <input
                  id="nr-target"
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    setTargetDate(e.target.value);
                  }}
                  className={fieldCls}
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-input text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !title.trim() || !requesterName.trim()}
              onClick={handleSubmit}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add request"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-muted-foreground mb-1 block text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
