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
      <div className="border-border bg-background flex items-end gap-2 rounded-lg border p-3">
        <div className="flex-1">
          <label
            htmlFor="new-name"
            className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
          >
            New sketch
          </label>
          <input
            id="new-name"
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
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No sketches yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Name a sketch above to get started. Each sketch is a standalone mockup — no roster, no
            implementations, no capacity math. Just rooms, trainers, classes, and a calendar.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
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
                <tr key={r.id} className="hover:bg-surface/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/sketchpad/${r.id}`}
                      className="text-foreground hover:text-primary font-medium underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.notes && (
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">{r.notes}</p>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {r.start_date} · {r.day_count}d · {r.hours_start}:00–{r.hours_end}:00
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{r.room_count}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{r.session_count}</td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {formatRelativeShort(r.updated_at)}
                  </td>
                  <td className="px-3 py-2">
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
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${
        className ?? ""
      }`}
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
