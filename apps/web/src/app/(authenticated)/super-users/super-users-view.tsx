"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PrinterIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import { toast } from "sonner";
import EmptyState from "@/components/ui/empty-state";
import SuperUserFormDialog from "./super-user-form-dialog";
import { markSuperUserTrained, restoreSuperUser, softDeleteSuperUser } from "./actions";
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
          <Link
            href="/super-users/print"
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
          >
            <PrinterIcon className="h-4 w-4" />
            Print
          </Link>
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
        </div>
      </div>

      {!props.showDeleted && props.superUsers.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {props.superUsers.length} super user{props.superUsers.length === 1 ? "" : "s"} ·{" "}
          {trainedCount} trained · {untrainedCount} pending
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
    <div className="border-border bg-background overflow-x-auto rounded-lg border">
      <table className="divide-border min-w-full divide-y text-sm">
        <thead className="bg-surface">
          <tr className="text-muted-foreground text-left text-[11px] font-medium uppercase tracking-wide">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Class / topic</th>
            <th className="px-3 py-2">Unit</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Trained</th>
            <th className="px-3 py-2 text-right">Actions</th>
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

function SuperUserRow({
  su,
  classes,
}: {
  su: SuperUserWithClass;
  classes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const archived = su.deleted_at != null;

  function toggleTrained() {
    startTransition(async () => {
      const result = await markSuperUserTrained(su.id, su.trained_at == null);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await softDeleteSuperUser(su.id);
      if (result.ok) {
        toast.success("Archived");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreSuperUser(su.id);
      if (result.ok) {
        toast.success("Restored");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <tr className={archived ? "opacity-60" : ""}>
      <td className="px-3 py-2">
        <p className="text-foreground font-medium">{su.full_name}</p>
      </td>
      <td className="px-3 py-2">
        {su.class_name ? (
          <Link href={`/classes/${su.class_id ?? ""}`} className="text-primary hover:underline">
            {su.class_name}
          </Link>
        ) : null}
        {su.class_name && su.topic && <span className="text-muted-foreground"> · </span>}
        {su.topic && <span className="text-foreground">{su.topic}</span>}
        {!su.class_name && !su.topic && <span className="text-muted-foreground">—</span>}
      </td>
      <td className="text-muted-foreground px-3 py-2">{su.unit ?? "—"}</td>
      <td className="text-muted-foreground px-3 py-2">
        {su.email ? (
          <a href={`mailto:${su.email}`} className="hover:text-foreground block">
            {su.email}
          </a>
        ) : null}
        {su.phone ? (
          <a href={`tel:${su.phone}`} className="hover:text-foreground block text-xs">
            {su.phone}
          </a>
        ) : null}
        {!su.email && !su.phone && "—"}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={toggleTrained}
          disabled={pending || archived}
          aria-label={su.trained_at ? "Mark as not trained" : "Mark as trained"}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            su.trained_at
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
          } disabled:opacity-50`}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {su.trained_at ? `Trained · ${su.trained_at}` : "Not trained"}
        </button>
      </td>
      <td className="px-3 py-2 text-right">
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
      </td>
    </tr>
  );
}
