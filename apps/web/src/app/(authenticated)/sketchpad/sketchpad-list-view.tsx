"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  PlusIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/20/solid";
import type { SketchpadSchedule } from "@arbor/shared";
import { Eyebrow } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createSchedule, deleteSchedule, duplicateSchedule } from "./actions";

type Row = SketchpadSchedule & { room_count: number; session_count: number };

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function SketchpadListView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give your sketch a name");
      return;
    }
    startTransition(async () => {
      const result = await createSchedule({ name });
      if (result.ok) {
        setNewName("");
        router.push(`/sketchpad/${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateSchedule(id);
      if (result.ok) {
        toast.success("Duplicated");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Delete sketch "${name}"? You can restore from the database within the audit window.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteSchedule(id);
      if (result.ok) {
        toast.success("Deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="border-border bg-background flex items-end gap-3 rounded-xl border p-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Eyebrow variant="section" id="new-name-label">
            New sketch
          </Eyebrow>
          <input
            id="new-name"
            aria-labelledby="new-name-label"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="e.g., EMR Cutover Wave 1 — June 2026"
            className={fieldClass + " w-full"}
            disabled={pending}
          />
        </div>
        <button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={handleCreate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Create
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-8 text-center">
          <p className="font-display text-foreground text-base font-medium leading-tight">
            No sketches yet
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Name a sketch above to get started. Each sketch is a standalone mockup — no roster, no
            implementations, no capacity math. Just rooms, trainers, classes, and a calendar.
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border border-b border-dashed">
              <tr>
                <Th>Name</Th>
                <Th>Window</Th>
                <Th className="text-right">Rooms</Th>
                <Th className="text-right">Sessions</Th>
                <Th>Updated</Th>
                <Th className="w-32" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/sketchpad/${r.id}`}
                      className="font-display text-foreground text-base font-medium leading-tight hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.notes && (
                      <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10.5px] tracking-[0.02em]">
                        {r.notes}
                      </p>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] tabular-nums">
                    {r.start_date} · {r.day_count}d · {r.hours_start}:00–{r.hours_end}:00
                  </td>
                  <td className="text-foreground px-4 py-3 text-right font-mono text-[11.5px] tabular-nums">
                    {r.room_count}
                  </td>
                  <td className="text-foreground px-4 py-3 text-right font-mono text-[11.5px] tabular-nums">
                    {r.session_count}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] tabular-nums">
                    {formatRelativeShort(r.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/sketchpad/${r.id}`}
                        className="text-muted-foreground hover:text-foreground rounded p-1"
                        aria-label="Open"
                        title="Open"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          handleDuplicate(r.id);
                        }}
                        disabled={pending}
                        className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-50"
                        aria-label="Duplicate"
                        title="Duplicate"
                      >
                        <DocumentDuplicateIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(r.id, r.name);
                        }}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                        aria-label="Delete"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function formatRelativeShort(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min.toString()}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr.toString()}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days.toString()}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
