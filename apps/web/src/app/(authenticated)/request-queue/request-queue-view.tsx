"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ClipboardDocumentIcon, CheckIcon, PlusIcon, LinkIcon } from "@heroicons/react/20/solid";
import RequestSheet from "./request-sheet";
import NewRequestDialog from "./new-request-dialog";
import {
  publicIntakeUrl,
  REQUEST_KANBAN_STATUS_VALUES,
  type EducationRequest,
  type EducationRequestAssignment,
  type Instructor,
  type PublicIntakeLink,
  type RequestStatus,
} from "@arbor/shared";
import { createIntakeLink, updateRequestStatus } from "./actions";

type Props = {
  requests: EducationRequest[];
  assignments: EducationRequestAssignment[];
  instructors: Instructor[];
  intakeLinks: PublicIntakeLink[];
  origin: string;
};

const URGENCY_BADGE: Record<string, string> = {
  low: "bg-surface text-muted-foreground",
  standard: "bg-primary/10 text-primary",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  urgent: "bg-destructive/10 text-destructive",
};

const COLUMN_LABELS: Record<RequestStatus, string> = {
  new: "New",
  under_review: "Under Review",
  approved: "Approved",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
  rejected: "Rejected",
};

export default function RequestQueueView({
  requests,
  assignments,
  instructors,
  intakeLinks,
  origin,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeLink = intakeLinks[0] ?? null;

  async function copyShareLink() {
    if (!activeLink) return;
    const url = publicIntakeUrl(origin, activeLink.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
      toast.success("Link copied — share it with stakeholders");
    } catch {
      toast.error("Couldn't copy. Manage links in admin to copy manually.");
    }
  }

  function quickCreateLink() {
    startTransition(async () => {
      const result = await createIntakeLink({ label: null, expires_at: null });
      if (result.ok) {
        const url = publicIntakeUrl(origin, result.data.token);
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Intake link created and copied to clipboard");
        } catch {
          toast.success("Intake link created — copy it from Admin → Intake links");
        }
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  // Local optimistic copy of the per-request status so drags feel instant.
  const [statusOverride, setStatusOverride] = useState<Record<string, RequestStatus>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const assignmentsByRequest = useMemo(() => {
    const m = new Map<string, EducationRequestAssignment[]>();
    for (const a of assignments) {
      const list = m.get(a.request_id) ?? [];
      list.push(a);
      m.set(a.request_id, list);
    }
    return m;
  }, [assignments]);

  const byColumn = useMemo(() => {
    const m: Record<RequestStatus, EducationRequest[]> = {
      new: [],
      under_review: [],
      approved: [],
      assigned: [],
      in_progress: [],
      completed: [],
      archived: [],
      rejected: [],
    };
    for (const r of requests) {
      const status = statusOverride[r.id] ?? r.status;
      m[status].push(r);
    }
    return m;
  }, [requests, statusOverride]);

  // Always show the six "active" columns. Surface archived / rejected
  // columns only when they have items — otherwise a status change via
  // the sheet to one of those terminal states would silently disappear
  // the card.
  const visibleColumns = useMemo<RequestStatus[]>(() => {
    const cols: RequestStatus[] = [...REQUEST_KANBAN_STATUS_VALUES];
    if (byColumn.archived.length > 0) cols.push("archived");
    if (byColumn.rejected.length > 0) cols.push("rejected");
    return cols;
  }, [byColumn]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const requestId = String(active.id);
    const targetStatus = String(over.id) as RequestStatus;
    const cur = requests.find((r) => r.id === requestId);
    if (!cur) return;
    const currentStatus = statusOverride[requestId] ?? cur.status;
    if (currentStatus === targetStatus) return;

    setStatusOverride((s) => ({ ...s, [requestId]: targetStatus }));
    startTransition(async () => {
      const result = await updateRequestStatus(requestId, { status: targetStatus });
      if (!result.ok) {
        toast.error(result.error.message);
        // Roll back the optimistic move
        setStatusOverride((s) => {
          const next = { ...s };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete next[requestId];
          return next;
        });
      } else {
        toast.success(`Moved to ${COLUMN_LABELS[targetStatus]}`);
        router.refresh();
      }
    });
  }

  const openRequest = openId ? (requests.find((r) => r.id === openId) ?? null) : null;

  return (
    <div className="space-y-4 p-6">
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LinkIcon className="text-muted-foreground h-4 w-4 shrink-0" />
          {activeLink ? (
            <>
              <span className="text-muted-foreground text-xs">External intake form:</span>
              <code className="bg-surface text-foreground truncate rounded px-2 py-0.5 text-xs">
                {publicIntakeUrl(origin, activeLink.token)}
              </code>
              <button
                type="button"
                onClick={() => {
                  void copyShareLink();
                }}
                className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs"
                aria-label="Copy intake link"
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ClipboardDocumentIcon className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </>
          ) : (
            <>
              <span className="text-muted-foreground text-xs">No external intake link yet.</span>
              <button
                type="button"
                disabled={pending}
                onClick={quickCreateLink}
                className="text-primary hover:text-primary/80 text-xs font-medium disabled:opacity-50"
              >
                Create one
              </button>
            </>
          )}
          <Link
            href="/admin/intake-links"
            className="text-muted-foreground hover:text-foreground ml-auto whitespace-nowrap text-xs underline-offset-4 hover:underline sm:ml-2"
          >
            Manage links →
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <PlusIcon className="h-4 w-4" />
          New request
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visibleColumns.map((status) => (
            <div key={status} className="w-72 shrink-0">
              <KanbanColumn
                status={status}
                label={COLUMN_LABELS[status]}
                requests={byColumn[status]}
                assignmentsByRequest={assignmentsByRequest}
                onOpen={(id) => {
                  setOpenId(id);
                }}
                pending={pending}
              />
            </div>
          ))}
        </div>
      </DndContext>

      {openRequest && (
        <RequestSheet
          request={openRequest}
          assignments={assignmentsByRequest.get(openRequest.id) ?? []}
          instructors={instructors}
          onClose={() => {
            setOpenId(null);
          }}
        />
      )}

      {showCreate && (
        <NewRequestDialog
          onClose={() => {
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  requests,
  assignmentsByRequest,
  onOpen,
  pending,
}: {
  status: RequestStatus;
  label: string;
  requests: EducationRequest[];
  assignmentsByRequest: Map<string, EducationRequestAssignment[]>;
  onOpen: (id: string) => void;
  pending: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`border-border bg-surface flex h-full min-h-[200px] flex-col rounded-xl border ${
        isOver ? "border-primary ring-primary/30 ring-2" : ""
      }`}
    >
      <div className="border-border bg-background flex items-center justify-between rounded-t-xl border-b px-3 py-2">
        <span className="text-foreground text-xs font-semibold">{label}</span>
        <span className="bg-surface text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
          {requests.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {requests.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">No requests</p>
        ) : (
          requests.map((r) => (
            <KanbanCard
              key={r.id}
              request={r}
              assignmentCount={(assignmentsByRequest.get(r.id) ?? []).length}
              onOpen={() => {
                onOpen(r.id);
              }}
              disabled={pending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  request,
  assignmentCount,
  onOpen,
  disabled,
}: {
  request: EducationRequest;
  assignmentCount: number;
  onOpen: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: request.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x.toString()}px, ${transform.y.toString()}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-border bg-background rounded-lg border p-3 shadow-sm ${
        disabled ? "cursor-wait opacity-70" : ""
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={-1}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-foreground line-clamp-2 text-sm font-medium">{request.title}</p>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium capitalize ${URGENCY_BADGE[request.urgency] ?? ""}`}
          >
            {request.urgency}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 truncate text-xs">
          {request.requested_by_name}
          {request.requested_by_department && ` · ${request.requested_by_department}`}
        </p>
      </div>
      <div className="border-border mt-2 flex items-center justify-between border-t pt-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {new Date(request.created_at).toLocaleDateString()}
        </span>
        <button type="button" onClick={onOpen} className="text-primary hover:underline">
          {assignmentCount > 0
            ? `${assignmentCount.toString()} assigned`
            : request.submitted_via === "public_form"
              ? "Public · open"
              : "Open"}
        </button>
      </div>
    </div>
  );
}
