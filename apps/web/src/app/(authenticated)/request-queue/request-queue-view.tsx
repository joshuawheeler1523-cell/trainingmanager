"use client";

import { useMemo, useState, useTransition } from "react";
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
import RequestSheet from "./request-sheet";
import {
  REQUEST_KANBAN_STATUS_VALUES,
  type EducationRequest,
  type EducationRequestAssignment,
  type Instructor,
  type RequestStatus,
} from "@arbor/shared";
import { updateRequestStatus } from "./actions";

type Props = {
  requests: EducationRequest[];
  assignments: EducationRequestAssignment[];
  instructors: Instructor[];
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

export default function RequestQueueView({ requests, assignments, instructors }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {REQUEST_KANBAN_STATUS_VALUES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              label={COLUMN_LABELS[status]}
              requests={byColumn[status]}
              assignmentsByRequest={assignmentsByRequest}
              onOpen={(id) => {
                setOpenId(id);
              }}
              pending={pending}
            />
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
