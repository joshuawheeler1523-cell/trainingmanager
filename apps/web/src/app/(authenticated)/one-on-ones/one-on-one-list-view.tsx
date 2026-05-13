"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { Instructor, OneOnOne } from "@arbor/shared";
import { createOneOnOne, deleteOneOnOne } from "./actions";

type Row = OneOnOne & { instructor_name: string };

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function OneOnOneListView({
  rows,
  instructors,
}: {
  rows: Row[];
  instructors: Instructor[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickInstructor, setPickInstructor] = useState("");

  function handleStart() {
    if (!pickInstructor) {
      toast.error("Pick an instructor");
      return;
    }
    startTransition(async () => {
      const result = await createOneOnOne({ instructor_id: pickInstructor });
      if (result.ok) {
        router.push(`/one-on-ones/${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete 1:1 with ${name}? This is a soft delete — restorable via the database.`))
      return;
    startTransition(async () => {
      const result = await deleteOneOnOne(id);
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
            htmlFor="start-instructor"
            className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
          >
            Start a new 1:1 with…
          </label>
          <select
            id="start-instructor"
            value={pickInstructor}
            onChange={(e) => {
              setPickInstructor(e.target.value);
            }}
            className={fieldClass + " w-full"}
            disabled={pending || instructors.length === 0}
          >
            <option value="">
              {instructors.length === 0 ? "No active instructors" : "Pick an instructor…"}
            </option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={pending || !pickInstructor}
          onClick={handleStart}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Start
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No 1:1s yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Start a 1:1 above. Capacity is captured at the start so the next session can show how
            things changed.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th>Instructor</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th className="text-right">Utilization</Th>
                <Th>Sentiment</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => {
                const isComplete = r.completed_at !== null;
                return (
                  <tr key={r.id} className="hover:bg-surface/40">
                    <td className="px-3 py-2">
                      <Link
                        href={`/one-on-ones/${r.id}`}
                        className="text-foreground hover:text-primary font-medium underline-offset-2 hover:underline"
                      >
                        {r.instructor_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isComplete
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                        }`}
                      >
                        {isComplete ? "Complete" : "In progress"}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {formatRelativeShort(r.scheduled_for)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.snapshot_utilization_pct != null
                        ? `${Math.round(r.snapshot_utilization_pct).toString()}%`
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs capitalize">
                      {r.sentiment ? r.sentiment.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(r.id, r.instructor_name);
                        }}
                        disabled={pending}
                        aria-label="Delete"
                        className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
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
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min.toString()}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr.toString()}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 14) return `${days.toString()}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
