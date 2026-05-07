"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

type Member = { userId: string; displayName: string };
type TableOption = { name: string };

type Props = {
  members: Member[];
  tableNames: TableOption[];
};

const OPERATIONS = ["INSERT", "UPDATE", "DELETE"] as const;

export default function AuditLogFilters({ members, tableNames }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const push = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(sp.toString());
      // Reset to page 1 whenever filters change
      params.delete("page");
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
          params.delete(k);
        } else if (Array.isArray(v)) {
          params.set(k, v.join(","));
        } else {
          params.set(k, v);
        }
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, sp],
  );

  const currentFrom = sp.get("from") ?? "";
  const currentTo = sp.get("to") ?? "";
  const currentUser = sp.get("user") ?? "";
  const currentTables = sp.get("tables") ? (sp.get("tables")?.split(",") ?? []) : [];
  const currentOps = sp.get("op") ? (sp.get("op")?.split(",") ?? []) : [];

  function toggleOp(op: string) {
    const next = currentOps.includes(op) ? currentOps.filter((o) => o !== op) : [...currentOps, op];
    push({ op: next });
  }

  function toggleTable(name: string) {
    const next = currentTables.includes(name)
      ? currentTables.filter((t) => t !== name)
      : [...currentTables, name];
    push({ tables: next });
  }

  function clearAll() {
    router.push(pathname);
  }

  const hasFilters =
    currentFrom || currentTo || currentUser || currentTables.length || currentOps.length;

  return (
    <div className="border-border bg-background flex flex-wrap items-end gap-3 rounded-lg border p-4">
      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs font-medium">From</label>
        <input
          type="date"
          value={currentFrom}
          onChange={(e) => {
            push({ from: e.target.value });
          }}
          className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs font-medium">To</label>
        <input
          type="date"
          value={currentTo}
          onChange={(e) => {
            push({ to: e.target.value });
          }}
          className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* User */}
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs font-medium">User</label>
        <select
          value={currentUser}
          onChange={(e) => {
            push({ user: e.target.value });
          }}
          className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        >
          <option value="">All users</option>
          <option value="system">System</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Table names */}
      {tableNames.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">Tables</label>
          <div className="flex flex-wrap gap-1.5">
            {tableNames.map((t) => {
              const active = currentTables.includes(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    toggleTable(t.name);
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-surface"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Operations */}
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs font-medium">Operation</label>
        <div className="flex gap-1.5">
          {OPERATIONS.map((op) => {
            const active = currentOps.includes(op);
            return (
              <button
                key={op}
                type="button"
                onClick={() => {
                  toggleOp(op);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-surface"
                }`}
              >
                {op}
              </button>
            );
          })}
        </div>
      </div>

      {/* Clear */}
      {hasFilters ? (
        <button
          type="button"
          onClick={clearAll}
          className="text-muted-foreground hover:text-foreground self-end rounded-md px-3 py-1.5 text-sm"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
