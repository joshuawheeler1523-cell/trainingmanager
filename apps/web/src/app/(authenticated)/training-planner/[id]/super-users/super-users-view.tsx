"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import { toast } from "sonner";
import EmptyState from "@/components/ui/empty-state";
import SuperUserFormDialog from "./super-user-form-dialog";
import { markImplSuperUserTrained, restoreImplSuperUser, softDeleteImplSuperUser } from "./actions";
import type { ImplSuperUserWithClass } from "@arbor/shared";

type Props = {
  implementationId: string;
  superUsers: ImplSuperUserWithClass[];
  classes: { id: string; name: string }[];
  showDeleted: boolean;
};

type ClassOption = { id: string; name: string };

// Special key for the bucket of super users with no class link.
const NO_CLASS_KEY = "__none__";

export default function SuperUsersView(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const search = sp.get("search") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Group super users by impl_class_id (or NO_CLASS_KEY for topic-only).
  const byClass = useMemo(() => {
    const map = new Map<string, ImplSuperUserWithClass[]>();
    for (const cls of props.classes) {
      map.set(cls.id, []);
    }
    map.set(NO_CLASS_KEY, []);
    for (const su of props.superUsers) {
      const key = su.impl_class_id ?? NO_CLASS_KEY;
      const list = map.get(key) ?? [];
      list.push(su);
      map.set(key, list);
    }
    return map;
  }, [props.superUsers, props.classes]);

  // Roll-up stats across all super users (for the summary strip).
  const totalSU = props.superUsers.length;
  const trainedCount = props.superUsers.filter((s) => s.trained_at != null).length;
  const untrainedCount = totalSU - trainedCount;
  const classesWithSU = props.classes.filter((c) => (byClass.get(c.id) ?? []).length > 0).length;
  const classesWithoutSU = props.classes.length - classesWithSU;

  function downloadCsv() {
    const headers = [
      "full_name",
      "email",
      "phone",
      "unit",
      "class",
      "topic",
      "trained",
      "trained_at",
    ];
    const rows = props.superUsers.map((s) => [
      s.full_name,
      s.email ?? "",
      s.phone ?? "",
      s.unit ?? "",
      s.impl_class_name ?? "",
      s.topic ?? "",
      s.trained_at ? "yes" : "no",
      s.trained_at ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((v) => {
            if (v.includes(",") || v.includes('"') || v.includes("\n")) {
              return `"${v.replaceAll('"', '""')}"`;
            }
            return v;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `super-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Filter applied at render time. We don't filter classes, so empty
  // classes still show — that's the whole point (visible gaps).
  function matchesSearch(su: ImplSuperUserWithClass): boolean {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      su.full_name.toLowerCase().includes(term) ||
      (su.email?.toLowerCase().includes(term) ?? false) ||
      (su.unit?.toLowerCase().includes(term) ?? false) ||
      (su.topic?.toLowerCase().includes(term) ?? false)
    );
  }

  const noClassList = (byClass.get(NO_CLASS_KEY) ?? []).filter(matchesSearch);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <MagnifyingGlassIcon className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setParam("search", e.target.value);
            }}
            placeholder="Search name, email, unit, topic…"
            className="border-input bg-background text-foreground focus:ring-ring w-72 rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2"
          />
        </div>

        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.showDeleted}
            onChange={(e) => {
              setParam("deleted", e.target.checked ? "1" : "");
            }}
            className="border-border h-4 w-4 rounded"
          />
          Show archived
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            disabled={totalSU === 0}
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export CSV
          </button>
          <SuperUserFormDialog
            mode="create"
            implementationId={props.implementationId}
            classes={props.classes}
            trigger={
              <button
                type="button"
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Add super user
              </button>
            }
          />
        </div>
      </div>

      {/* Summary strip */}
      {(props.classes.length > 0 || totalSU > 0) && (
        <div className="border-border bg-surface flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border p-3 text-xs">
          <span className="text-foreground font-semibold">
            {classesWithSU} of {props.classes.length} classes covered
          </span>
          {classesWithoutSU > 0 && (
            <span className="text-warning">
              {classesWithoutSU} {classesWithoutSU === 1 ? "class needs" : "classes need"} a super
              user
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {totalSU} super user{totalSU === 1 ? "" : "s"} total · {trainedCount} trained ·{" "}
            {untrainedCount} pending
          </span>
        </div>
      )}

      {/* No classes case */}
      {props.classes.length === 0 && noClassList.length === 0 && (
        <EmptyState
          title="No classes in this training plan yet"
          description="Add classes on Step 5 first. Once you have classes, you can assign super users to each from this page."
        />
      )}

      {/* Per-class cards */}
      {props.classes.length > 0 && (
        <ul className="space-y-3">
          {props.classes.map((cls) => {
            const list = (byClass.get(cls.id) ?? []).filter(matchesSearch);
            return (
              <li key={cls.id}>
                <ClassCard
                  implementationId={props.implementationId}
                  cls={cls}
                  classes={props.classes}
                  superUsers={list}
                  totalForClass={(byClass.get(cls.id) ?? []).length}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* Topic-only / unassigned bucket. Always render the section header
          so users know it exists, even if empty. */}
      {(noClassList.length > 0 || (byClass.get(NO_CLASS_KEY) ?? []).length > 0) && (
        <div className="pt-2">
          <UnassignedSection
            implementationId={props.implementationId}
            classes={props.classes}
            superUsers={noClassList}
            total={(byClass.get(NO_CLASS_KEY) ?? []).length}
          />
        </div>
      )}
    </div>
  );
}

function ClassCard({
  implementationId,
  cls,
  classes,
  superUsers,
  totalForClass,
}: {
  implementationId: string;
  cls: ClassOption;
  classes: ClassOption[];
  superUsers: ImplSuperUserWithClass[];
  totalForClass: number;
}) {
  const trained = superUsers.filter((s) => s.trained_at != null).length;
  const isEmpty = totalForClass === 0;

  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <div
        className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${
          isEmpty ? "border-warning-bd bg-warning-bg/60" : "border-border bg-surface/40"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">{cls.name}</p>
          <p className={`mt-0.5 text-xs ${isEmpty ? "text-warning" : "text-muted-foreground"}`}>
            {isEmpty ? (
              <>
                <ExclamationTriangleIcon className="mr-1 inline h-3 w-3" />
                No super users assigned
              </>
            ) : (
              <>
                {totalForClass} super user{totalForClass === 1 ? "" : "s"} · {trained} trained
              </>
            )}
          </p>
        </div>
        <SuperUserFormDialog
          mode="create"
          implementationId={implementationId}
          classes={classes}
          defaultClassId={cls.id}
          trigger={
            <button
              type="button"
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          }
        />
      </div>

      {superUsers.length > 0 && (
        <ul className="divide-border divide-y">
          {superUsers.map((su) => (
            <li key={su.id}>
              <SuperUserRow su={su} classes={classes} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UnassignedSection({
  implementationId,
  classes,
  superUsers,
  total,
}: {
  implementationId: string;
  classes: ClassOption[];
  superUsers: ImplSuperUserWithClass[];
  total: number;
}) {
  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border bg-surface/40 flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">Topic only — no class link</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {total} super user{total === 1 ? "" : "s"} tracked by free-text topic
          </p>
        </div>
        <SuperUserFormDialog
          mode="create"
          implementationId={implementationId}
          classes={classes}
          trigger={
            <button
              type="button"
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          }
        />
      </div>
      {superUsers.length > 0 && (
        <ul className="divide-border divide-y">
          {superUsers.map((su) => (
            <li key={su.id}>
              <SuperUserRow su={su} classes={classes} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuperUserRow({ su, classes }: { su: ImplSuperUserWithClass; classes: ClassOption[] }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const archived = su.deleted_at != null;

  function toggleTrained() {
    setBusy(true);
    startTransition(async () => {
      const result = await markImplSuperUserTrained(su.id, su.trained_at == null);
      setBusy(false);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleArchive() {
    if (!confirm(`Archive ${su.full_name}?`)) return;
    setBusy(true);
    startTransition(async () => {
      const result = await softDeleteImplSuperUser(su.id);
      setBusy(false);
      if (result.ok) toast.success("Archived");
      else toast.error(result.error.message);
    });
  }

  function handleRestore() {
    setBusy(true);
    startTransition(async () => {
      const result = await restoreImplSuperUser(su.id);
      setBusy(false);
      if (result.ok) toast.success("Restored");
      else toast.error(result.error.message);
    });
  }

  const disabled = pending || busy;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ${archived ? "opacity-60" : ""}`}
    >
      <div className="min-w-[10rem] flex-1">
        <p className="text-foreground text-sm font-medium">{su.full_name}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {su.unit ?? <span className="italic">no unit</span>}
          {su.topic && <span> · {su.topic}</span>}
        </p>
      </div>
      <div className="text-muted-foreground text-xs">
        {su.email && (
          <a href={`mailto:${su.email}`} className="hover:text-foreground block">
            {su.email}
          </a>
        )}
        {su.phone && (
          <a href={`tel:${su.phone}`} className="hover:text-foreground block">
            {su.phone}
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={toggleTrained}
        disabled={disabled || archived}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          su.trained_at
            ? "bg-success-bg text-success hover:bg-success-bg"
            : "bg-warning-bg text-warning hover:bg-warning-bg"
        } disabled:opacity-50`}
      >
        <CheckCircleIcon className="h-3.5 w-3.5" />
        {su.trained_at ? `Trained · ${su.trained_at}` : "Not trained"}
      </button>
      <div className="inline-flex items-center gap-1">
        {!archived && (
          <SuperUserFormDialog
            mode="edit"
            classes={classes}
            superUser={su}
            trigger={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground rounded p-1"
                aria-label="Edit"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            }
          />
        )}
        {archived ? (
          <button
            type="button"
            onClick={handleRestore}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs disabled:opacity-50"
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={handleArchive}
            disabled={disabled}
            className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
            aria-label="Archive"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
