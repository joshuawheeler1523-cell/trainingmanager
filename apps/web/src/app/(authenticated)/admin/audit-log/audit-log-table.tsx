"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { jsonDiff, type DiffEntry } from "@/lib/json-diff";
import type { Json } from "@/lib/supabase/database.types";

type AuditRow = {
  id: number;
  actor_id: string | null;
  operation: string;
  table_name: string;
  record_id: string;
  changed_fields: string[] | null;
  old_values: Json | null;
  new_values: Json | null;
  occurred_at: string;
};

type Member = { userId: string; displayName: string };

type Props = {
  rows: AuditRow[];
  members: Member[];
};

const OP_STYLES: Record<string, string> = {
  INSERT: "bg-capacity-green-bg text-capacity-green",
  UPDATE: "bg-status-blue-bg text-status-blue",
  DELETE: "bg-capacity-red-bg text-capacity-red",
};

function displayActor(actorId: string | null, members: Member[]): string {
  if (!actorId) return "System";
  const m = members.find((m) => m.userId === actorId);
  return m?.displayName ?? actorId.slice(0, 8) + "…";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DiffView({
  old_values,
  new_values,
  operation,
}: {
  old_values: Json | null;
  new_values: Json | null;
  operation: string;
}) {
  const oldObj =
    old_values && typeof old_values === "object" && !Array.isArray(old_values)
      ? (old_values as Record<string, unknown>)
      : null;
  const newObj =
    new_values && typeof new_values === "object" && !Array.isArray(new_values)
      ? (new_values as Record<string, unknown>)
      : null;

  if (!oldObj && !newObj) {
    return <p className="text-muted-foreground text-xs">No values captured.</p>;
  }

  const entries: DiffEntry[] =
    operation === "INSERT" && newObj
      ? Object.keys(newObj)
          .sort()
          .map((key) => ({ key, kind: "added", newValue: newObj[key] }))
      : operation === "DELETE" && oldObj
        ? Object.keys(oldObj)
            .sort()
            .map((key) => ({ key, kind: "removed", oldValue: oldObj[key] }))
        : jsonDiff(oldObj, newObj);

  const relevant = entries.filter((e) => e.kind !== "unchanged");

  if (!relevant.length) {
    return <p className="text-muted-foreground text-xs">No changed fields.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="w-1/4 pb-1 font-medium">Field</th>
          {operation !== "INSERT" && <th className="w-[37.5%] pb-1 font-medium">Before</th>}
          {operation !== "DELETE" && <th className="w-[37.5%] pb-1 font-medium">After</th>}
        </tr>
      </thead>
      <tbody className="divide-border divide-y">
        {relevant.map((e) => (
          <tr key={e.key}>
            <td className="text-foreground py-1 pr-2 font-mono">{e.key}</td>
            {operation !== "INSERT" && (
              <td className="text-capacity-red py-1 pr-2 font-mono">
                {e.kind === "removed" || e.kind === "changed" ? JSON.stringify(e.oldValue) : null}
              </td>
            )}
            {operation !== "DELETE" && (
              <td className="text-capacity-green py-1 font-mono">
                {e.kind === "added" || e.kind === "changed" ? JSON.stringify(e.newValue) : null}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditRowItem({ row, members }: { row: AuditRow; members: Member[] }) {
  const [expanded, setExpanded] = useState(false);
  const opStyle = OP_STYLES[row.operation] ?? "bg-surface text-foreground";

  return (
    <>
      <tr
        className="hover:bg-surface cursor-pointer"
        onClick={() => {
          setExpanded((v) => !v);
        }}
      >
        <td className="px-4 py-2.5">
          {expanded ? (
            <ChevronDownIcon className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronRightIcon className="text-muted-foreground h-4 w-4" />
          )}
        </td>
        <td className="text-muted-foreground px-4 py-2.5 text-xs">{formatDate(row.occurred_at)}</td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${opStyle}`}
          >
            {row.operation}
          </span>
        </td>
        <td className="text-foreground px-4 py-2.5 font-mono text-xs">{row.table_name}</td>
        <td className="text-foreground px-4 py-2.5 text-xs">
          {displayActor(row.actor_id, members)}
        </td>
        <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
          {row.record_id.slice(0, 8)}…
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="border-border bg-surface border-b px-8 py-4">
            <DiffView
              old_values={row.old_values}
              new_values={row.new_values}
              operation={row.operation}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditLogTable({ rows, members }: Props) {
  if (!rows.length) {
    return (
      <div className="border-border bg-background rounded-lg border py-12 text-center">
        <p className="text-muted-foreground text-sm">No audit log entries match your filters.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border">
      <table className="w-full">
        <thead className="border-border bg-surface border-b">
          <tr>
            <th className="w-8 px-4 py-2.5" />
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Time
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Operation
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Table
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Actor
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Record
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row) => (
            <AuditRowItem key={row.id} row={row} members={members} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
