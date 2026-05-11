"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createIncidentAction, deleteIncidentAction, postIncidentUpdateAction } from "./actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const SEVERITY = ["minor", "major", "critical", "maintenance"] as const;
const STATUS = ["investigating", "identified", "monitoring", "resolved", "scheduled"] as const;

type Incident = {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
  updates: { id: string; status: string; body: string; created_at: string }[];
};

export default function IncidentsManager({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITY)[number]>("minor");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("investigating");
  const [updateBodyByIncident, setUpdateBodyByIncident] = useState<Record<string, string>>({});
  const [updateStatusByIncident, setUpdateStatusByIncident] = useState<Record<string, string>>({});

  const active = incidents.filter((i) => i.status !== "resolved");
  const resolved = incidents.filter((i) => i.status === "resolved");

  const handleCreate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createIncidentAction({ title, body, severity, status });
      if (result.ok) {
        toast.success("Incident posted to /status");
        setTitle("");
        setBody("");
        setSeverity("minor");
        setStatus("investigating");
        setShowCreate(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleUpdate = (incidentId: string) => {
    const u = updateBodyByIncident[incidentId] ?? "";
    const s =
      (updateStatusByIncident[incidentId] as (typeof STATUS)[number] | undefined) ??
      "investigating";
    if (!u.trim()) {
      toast.error("Add an update body");
      return;
    }
    startTransition(async () => {
      const result = await postIncidentUpdateAction({ incidentId, status: s, body: u });
      if (result.ok) {
        toast.success(s === "resolved" ? "Incident resolved" : "Update posted");
        setUpdateBodyByIncident((prev) => ({ ...prev, [incidentId]: "" }));
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleDelete = (incidentId: string, title: string) => {
    if (!confirm(`Delete incident "${title}" permanently?`)) return;
    startTransition(async () => {
      const result = await deleteIncidentAction({ id: incidentId });
      if (result.ok) {
        toast.success("Incident deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* New */}
      {showCreate ? (
        <form
          onSubmit={handleCreate}
          className="border-border bg-background space-y-3 rounded-xl border p-5"
        >
          <h2 className="text-foreground text-base font-bold">Post incident</h2>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            placeholder="Title (e.g. Elevated 5xx on /api/v1)"
            className={fieldClass}
          />
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
            }}
            rows={3}
            placeholder="What's happening (optional)"
            className={fieldClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Severity</label>
              <select
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value as (typeof SEVERITY)[number]);
                }}
                className={fieldClass}
              >
                {SEVERITY.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as (typeof STATUS)[number]);
                }}
                className={fieldClass}
              >
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !title.trim()}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Posting…" : "Post incident"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
              }}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
          }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          + Post incident
        </button>
      )}

      {/* Active incidents */}
      <section>
        <h2 className="text-foreground mb-3 text-base font-bold">
          Active ({active.length.toString()})
        </h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">No active incidents.</p>
        ) : (
          <ul className="space-y-3">
            {active.map((i) => (
              <li
                key={i.id}
                className="border-border bg-background space-y-3 rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-foreground text-sm font-semibold">{i.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {i.severity} · {i.status} · started{" "}
                      {i.started_at.replace("T", " ").slice(0, 16)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelete(i.id, i.title);
                    }}
                    disabled={pending}
                    className="text-destructive text-xs hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                {i.body && <p className="text-foreground text-sm">{i.body}</p>}

                {i.updates.length > 0 && (
                  <ul className="border-border space-y-2 border-t pt-3 text-sm">
                    {[...i.updates]
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((u) => (
                        <li key={u.id}>
                          <p className="text-foreground text-xs font-medium uppercase">
                            {u.status} ·{" "}
                            <span className="text-muted-foreground">
                              {u.created_at.replace("T", " ").slice(0, 16)}
                            </span>
                          </p>
                          <p className="text-foreground mt-1 text-sm">{u.body}</p>
                        </li>
                      ))}
                  </ul>
                )}

                {/* Post update */}
                <div className="border-border space-y-2 border-t pt-3">
                  <p className="text-foreground text-xs font-semibold">Post update</p>
                  <select
                    value={updateStatusByIncident[i.id] ?? "investigating"}
                    onChange={(e) => {
                      setUpdateStatusByIncident((prev) => ({ ...prev, [i.id]: e.target.value }));
                    }}
                    className={fieldClass}
                  >
                    {STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={updateBodyByIncident[i.id] ?? ""}
                    onChange={(e) => {
                      setUpdateBodyByIncident((prev) => ({ ...prev, [i.id]: e.target.value }));
                    }}
                    rows={2}
                    placeholder="Update body…"
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdate(i.id);
                    }}
                    disabled={pending || !(updateBodyByIncident[i.id] ?? "").trim()}
                    className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "Posting…" : "Post update"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Resolved */}
      <section>
        <h2 className="text-foreground mb-3 text-base font-bold">
          Resolved ({resolved.length.toString()})
        </h2>
        {resolved.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">No resolved incidents.</p>
        ) : (
          <ul className="border-border bg-background divide-border divide-y rounded-xl border">
            {resolved.map((i) => (
              <li key={i.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-foreground text-sm font-medium">{i.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {i.severity} · resolved{" "}
                    {(i.resolved_at ?? i.started_at).replace("T", " ").slice(0, 16)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleDelete(i.id, i.title);
                  }}
                  disabled={pending}
                  className="text-destructive text-xs hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
