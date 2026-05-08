"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { createClient } from "@/lib/supabase/client";
import {
  REQUEST_STATUS_VALUES,
  type EducationRequest,
  type EducationRequestAssignment,
  type EducationRequestHistoryEntry,
  type Instructor,
  type RequestStatus,
} from "@arbor/shared";
import {
  updateRequestStatus,
  updateRequest,
  assignRequestInstructor,
  unassignRequestInstructor,
} from "./actions";

type Props = {
  request: EducationRequest;
  assignments: EducationRequestAssignment[];
  instructors: Instructor[];
  onClose: () => void;
};

const STATUS_BADGE: Record<RequestStatus, string> = {
  new: "bg-primary/10 text-primary",
  under_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  in_progress: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  archived: "bg-surface text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

export default function RequestSheet({ request, assignments, instructors, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [reviewNotes, setReviewNotes] = useState(request.review_notes ?? "");
  const [history, setHistory] = useState<EducationRequestHistoryEntry[]>([]);

  // Fetch the audit history client-side (small payload, fine for SSR-skip).
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void supabase
      .from("education_request_history")
      .select("*")
      .eq("request_id", request.id)
      .order("occurred_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setHistory((data ?? []) as EducationRequestHistoryEntry[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request.id, request.status, request.updated_at]);

  function handleStatusChange(next: RequestStatus) {
    startTransition(async () => {
      const result = await updateRequestStatus(request.id, { status: next });
      if (result.ok) {
        toast.success("Status updated");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleSaveReviewNotes() {
    startTransition(async () => {
      const result = await updateRequest(request.id, { review_notes: reviewNotes || null });
      if (result.ok) {
        toast.success("Review notes saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  // ── Assignments add-row state ─────────────────────────────────────────────
  const assignedIds = new Set(assignments.map((a) => a.instructor_id));
  const available = instructors.filter((i) => !assignedIds.has(i.id));
  const [pickInstructor, setPickInstructor] = useState("");
  const [pickHours, setPickHours] = useState(4);

  function handleAdd() {
    if (!pickInstructor || pickHours < 0) return;
    startTransition(async () => {
      const result = await assignRequestInstructor(request.id, {
        instructor_id: pickInstructor,
        estimated_hours: pickHours,
      });
      if (result.ok) {
        toast.success("Instructor assigned");
        setPickInstructor("");
        setPickHours(4);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(assignmentId: string) {
    startTransition(async () => {
      const result = await unassignRequestInstructor(assignmentId);
      if (result.ok) {
        toast.success("Removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function instructorName(id: string) {
    return instructors.find((i) => i.id === id)?.full_name ?? id;
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:slide-in-from-right fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-2xl flex-col border-l shadow-xl">
          <div className="border-border flex items-start justify-between gap-3 border-b px-6 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[request.status]}`}
                >
                  {request.status.replace(/_/g, " ")}
                </span>
                <span className="text-muted-foreground text-xs">
                  {request.submitted_via === "public_form" ? "Public form" : "Internal"}
                </span>
              </div>
              <Dialog.Title className="text-foreground mt-1 text-base font-semibold">
                {request.title}
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground mt-0.5 text-xs">
                Submitted by {request.requested_by_name}
                {request.requested_by_email && ` (${request.requested_by_email})`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Status changer */}
            <section className="mb-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium">Status</p>
              <div className="flex flex-wrap gap-2">
                {REQUEST_STATUS_VALUES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pending || s === request.status}
                    onClick={() => {
                      handleStatusChange(s);
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      s === request.status
                        ? STATUS_BADGE[s]
                        : "border-border bg-background text-foreground hover:bg-surface border"
                    } disabled:opacity-50`}
                  >
                    {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </section>

            {/* Details */}
            <section className="mb-6 space-y-3">
              <h3 className="text-foreground text-sm font-semibold">Details</h3>
              <Field label="Department" value={request.requested_by_department} />
              <Field label="Target audience" value={request.target_audience} />
              <Field label="Target completion" value={request.target_completion_date} />
              <Field label="Urgency" value={request.urgency} />
              <Field
                label="Business justification"
                value={request.business_justification}
                multiline
              />
            </section>

            {/* Review notes */}
            <section className="mb-6">
              <h3 className="text-foreground mb-2 text-sm font-semibold">Review notes</h3>
              <textarea
                rows={4}
                value={reviewNotes}
                onChange={(e) => {
                  setReviewNotes(e.target.value);
                }}
                className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                placeholder="Reviewer notes carry into status-history entries."
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={pending || reviewNotes === (request.review_notes ?? "")}
                  onClick={handleSaveReviewNotes}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  Save notes
                </button>
              </div>
            </section>

            {/* Assignments */}
            <section className="mb-6">
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                Assigned instructors ({assignments.length})
              </h3>
              {assignments.length === 0 ? (
                <p className="text-muted-foreground text-xs">No instructors assigned yet.</p>
              ) : (
                <ul className="border-border divide-border divide-y rounded-md border">
                  {assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-foreground">{instructorName(a.instructor_id)}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {a.estimated_hours.toFixed(1)} h
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            handleRemove(a.id);
                          }}
                          aria-label="Remove assignment"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {available.length > 0 && (
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1">
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Add instructor</p>
                    <select
                      value={pickInstructor}
                      onChange={(e) => {
                        setPickInstructor(e.target.value);
                      }}
                      className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                    >
                      <option value="">Select…</option>
                      {available.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Est. hrs</p>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={pickHours}
                      onChange={(e) => {
                        setPickHours(Number(e.target.value));
                      }}
                      className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={pending || !pickInstructor}
                    onClick={handleAdd}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Assign
                  </button>
                </div>
              )}
            </section>

            {/* History */}
            <section>
              <h3 className="text-foreground mb-2 text-sm font-semibold">Status history</h3>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-xs">No history yet.</p>
              ) : (
                <ol className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-start gap-3 text-xs">
                      <span className="bg-primary/20 mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground">
                          <span className="capitalize">
                            {(h.from_status ?? "created").replace(/_/g, " ")}
                          </span>{" "}
                          →{" "}
                          <span className="font-medium capitalize">
                            {h.to_status.replace(/_/g, " ")}
                          </span>
                        </p>
                        {h.comment && <p className="text-muted-foreground mt-0.5">{h.comment}</p>}
                        <p className="text-muted-foreground mt-0.5 tabular-nums">
                          {new Date(h.occurred_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p
        className={`text-foreground mt-0.5 text-sm capitalize ${multiline ? "whitespace-pre-wrap" : ""}`}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}
