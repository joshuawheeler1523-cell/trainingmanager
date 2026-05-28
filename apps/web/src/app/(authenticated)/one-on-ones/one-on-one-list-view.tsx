"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { Instructor, OneOnOne } from "@arbor/shared";
import { Badge, Eyebrow } from "@/components/ui";
import { cn } from "@/lib/utils";
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
      if (result.ok) toast.success("Deleted");
      else toast.error(result.error.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="border-border bg-background flex items-end gap-3 rounded-xl border p-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Eyebrow variant="section" id="start-instructor-label">
            Start a new 1:1 with…
          </Eyebrow>
          <select
            id="start-instructor"
            aria-labelledby="start-instructor-label"
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
        <div className="border-border bg-surface rounded-xl border border-dashed p-8 text-center">
          <p className="font-display text-foreground text-base font-medium leading-tight">
            No 1:1s yet
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Start a 1:1 above. Capacity is captured at the start so the next session can show how
            things changed.
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border border-b border-dashed">
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
                  <tr key={r.id} className="hover:bg-surface">
                    <td className="px-4 py-3">
                      <Link
                        href={`/one-on-ones/${r.id}`}
                        className="font-display text-foreground text-base font-medium leading-tight hover:underline"
                      >
                        {r.instructor_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={isComplete ? "success" : "warning"}>
                        {isComplete ? "Complete" : "In progress"}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] tabular-nums">
                      {formatRelativeShort(r.scheduled_for)}
                    </td>
                    <td className="text-foreground px-4 py-3 text-right font-mono text-[11.5px] tabular-nums">
                      {r.snapshot_utilization_pct != null
                        ? `${Math.round(r.snapshot_utilization_pct).toString()}%`
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.04em]">
                      {r.sentiment ? r.sentiment.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
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
