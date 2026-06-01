"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PrinterIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import { toast } from "sonner";
import EmptyState from "@/components/ui/empty-state";
import CsvImportDialog from "@/components/csv-import-dialog";
import { cn } from "@/lib/utils";
import { ManagerOnly } from "@/components/auth/role-gate";
import SuperUserFormDialog from "./super-user-form-dialog";
import {
  importSuperUsersCsv,
  markSuperUserTrained,
  restoreSuperUser,
  softDeleteSuperUser,
} from "./actions";
import type { SuperUserWithClass } from "@arbor/shared";

type Props = {
  superUsers: SuperUserWithClass[];
  classes: { id: string; name: string }[];
  units: string[];
  showDeleted: boolean;
};

export default function SuperUsersView(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const search = sp.get("search") ?? "";
  const classFilter = sp.get("class") ?? "";
  const trainedFilter = sp.get("trained") ?? "";
  const unitFilter = sp.get("unit") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const trainedCount = useMemo(
    () => props.superUsers.filter((s) => s.trained_at != null).length,
    [props.superUsers],
  );
  const untrainedCount = props.superUsers.length - trainedCount;

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
      s.class_name ?? "",
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

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <MagnifyingGlassIcon className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setParam("search", e.target.value);
            }}
            placeholder="Search name, email, topic, unit…"
            className="border-input bg-background text-foreground focus:ring-ring w-72 rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2"
          />
        </div>

        <select
          value={classFilter}
          onChange={(e) => {
            setParam("class", e.target.value);
          }}
          className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        >
          <option value="">All classes / topics</option>
          <option value="__none__">— No class (ad-hoc only) —</option>
          {props.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={trainedFilter}
          onChange={(e) => {
            setParam("trained", e.target.value);
          }}
          className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        >
          <option value="">All (trained & not)</option>
          <option value="yes">Trained</option>
          <option value="no">Not trained yet</option>
        </select>

        {props.units.length > 0 && (
          <select
            value={unitFilter}
            onChange={(e) => {
              setParam("unit", e.target.value);
            }}
            className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
          >
            <option value="">All units</option>
            {props.units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}

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
            disabled={props.superUsers.length === 0}
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export CSV
          </button>
          <ManagerOnly>
            <CsvImportDialog
              entity="super users"
              description="Each row creates a super user in the current department. A person can be a super user for multiple classes/topics, so rows always insert (no updating existing). Each row needs a class_name (matched to an existing class) OR a topic."
              columns={[
                {
                  key: "full_name",
                  required: true,
                  help: "Display name; max 200 chars",
                  example: "Jane Doe",
                },
                { key: "email", required: false, example: "jane.doe@hospital.org" },
                { key: "phone", required: false, example: "555-0142" },
                { key: "unit", required: false, help: "Unit / floor label", example: "ICU" },
                {
                  key: "class_name",
                  required: false,
                  help: "Must match an existing class name (case-insensitive)",
                  example: "ACLS Certification",
                },
                {
                  key: "topic",
                  required: false,
                  help: "Free-text topic; required if no class_name",
                  example: "",
                },
                {
                  key: "trained_at",
                  required: false,
                  help: "ISO date YYYY-MM-DD; blank = not yet trained",
                  example: "2025-04-15",
                },
              ]}
              serverAction={importSuperUsersCsv}
              trigger={
                <button
                  type="button"
                  className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Import CSV
                </button>
              }
            />
          </ManagerOnly>
          <Link
            href="/super-users/print"
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
          >
            <PrinterIcon className="h-4 w-4" />
            Print
          </Link>
          <ManagerOnly>
            <SuperUserFormDialog
              mode="create"
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
          </ManagerOnly>
        </div>
      </div>

      {!props.showDeleted && props.superUsers.length > 0 && (
        <p className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
          <b className="text-foreground font-medium normal-case tabular-nums">
            {props.superUsers.length}
          </b>{" "}
          super user{props.superUsers.length === 1 ? "" : "s"} ·{" "}
          <b className="text-foreground font-medium tabular-nums">{trainedCount}</b> trained ·{" "}
          <b className="text-foreground font-medium tabular-nums">{untrainedCount}</b> pending
        </p>
      )}

      {props.superUsers.length === 0 ? (
        <EmptyState
          title={
            props.showDeleted ? "No archived super users" : "No super users match these filters"
          }
          description={
            props.showDeleted
              ? "Archived super users appear here."
              : "Clear filters above, or add a super user."
          }
        />
      ) : (
        <SuperUsersTable rows={props.superUsers} classes={props.classes} />
      )}
    </div>
  );
}

function SuperUsersTable({
  rows,
  classes,
}: {
  rows: SuperUserWithClass[];
  classes: { id: string; name: string }[];
}) {
  return (
    <div className="border-border bg-background overflow-x-auto rounded-xl border">
      <table className="divide-border min-w-full divide-y text-sm">
        <thead className="border-border border-b border-dashed">
          <tr className="text-muted-foreground text-left">
            <Th>Name</Th>
            <Th>Class / topic</Th>
            <Th>Unit</Th>
            <Th>Contact</Th>
            <Th>Trained</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((su) => (
            <SuperUserRow key={su.id} su={su} classes={classes} />
          ))}
        </tbody>
      </table>
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

function SuperUserRow({
  su,
  classes,
}: {
  su: SuperUserWithClass;
  classes: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const archived = su.deleted_at != null;

  function toggleTrained() {
    startTransition(async () => {
      const result = await markSuperUserTrained(su.id, su.trained_at == null);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await softDeleteSuperUser(su.id);
      if (result.ok) toast.success("Archived");
      else toast.error(result.error.message);
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreSuperUser(su.id);
      if (result.ok) toast.success("Restored");
      else toast.error(result.error.message);
    });
  }

  return (
    <tr className={cn("hover:bg-surface", archived && "opacity-60")}>
      <td className="px-4 py-3">
        <p className="font-display text-foreground text-base font-medium leading-tight">
          {su.full_name}
        </p>
      </td>
      <td className="px-4 py-3 text-sm">
        {su.class_name ? (
          <Link href={`/classes/${su.class_id ?? ""}`} className="text-foreground hover:underline">
            {su.class_name}
          </Link>
        ) : null}
        {su.class_name && su.topic && <span className="text-muted-foreground"> · </span>}
        {su.topic && <span className="text-foreground">{su.topic}</span>}
        {!su.class_name && !su.topic && <span className="text-muted-foreground">—</span>}
      </td>
      <td className="text-muted-foreground px-4 py-3 text-sm">{su.unit ?? "—"}</td>
      <td className="text-muted-foreground px-4 py-3 font-mono text-[11px] tracking-[0.02em]">
        {su.email ? (
          <a href={`mailto:${su.email}`} className="hover:text-foreground block">
            {su.email}
          </a>
        ) : null}
        {su.phone ? (
          <a href={`tel:${su.phone}`} className="hover:text-foreground block text-[10.5px]">
            {su.phone}
          </a>
        ) : null}
        {!su.email && !su.phone && "—"}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={toggleTrained}
          disabled={pending || archived}
          aria-label={su.trained_at ? "Mark as not trained" : "Mark as trained"}
          className={cn(
            "inline-flex items-center gap-1 rounded-[3px] px-2 py-1 font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.06em] transition-colors disabled:opacity-50",
            su.trained_at
              ? "bg-[rgba(59,122,68,0.10)] text-[var(--forest)] hover:bg-[rgba(59,122,68,0.18)]"
              : "bg-[rgba(201,138,58,0.14)] text-[var(--persimmon-deep)] hover:bg-[rgba(201,138,58,0.22)]",
          )}
        >
          <CheckCircleIcon className="h-3 w-3" />
          {su.trained_at ? `Trained · ${su.trained_at}` : "Not trained"}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <ManagerOnly>
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
                disabled={pending}
                className="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs disabled:opacity-50"
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={handleArchive}
                disabled={pending}
                aria-label="Archive"
                className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </ManagerOnly>
      </td>
    </tr>
  );
}
