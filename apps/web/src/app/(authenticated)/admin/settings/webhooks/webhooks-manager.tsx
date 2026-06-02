"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteWebhookEndpointAction,
  replayWebhookDeliveryAction,
  rotateWebhookSecretAction,
  upsertWebhookEndpointAction,
} from "./actions";

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const EVENTS = [
  "tra.created",
  "tra.updated",
  "class.created",
  "class.completed",
  "instructor.created",
  "project.created",
  "task.completed",
] as const;

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  signing_secret: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
};

type Delivery = {
  id: string;
  endpoint_id: string;
  event_type: string;
  status: string;
  response_code: number | null;
  attempts: number;
  created_at: string;
  delivered_at: string | null;
};

export default function WebhooksManager({
  endpoints,
  deliveries,
}: {
  endpoints: Endpoint[];
  deliveries: Delivery[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Per-row pending id so a click on row A's button doesn't disable
  // every other row's buttons. The global `pending` flag still drives
  // the create form's submit button.
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const toggleEvent = (e: string) => {
    setSelectedEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const runRow = (id: string, op: () => Promise<void>) => {
    setPendingRowId(id);
    startTransition(async () => {
      try {
        await op();
      } finally {
        setPendingRowId(null);
      }
    });
  };

  const handleCreate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertWebhookEndpointAction({
        url,
        description,
        events: selectedEvents,
        enabled: true,
      });
      if (result.ok) {
        if (result.data.signingSecret) setNewSecret(result.data.signingSecret);
        setUrl("");
        setDescription("");
        setSelectedEvents([]);
        toast.success("Webhook endpoint created");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleRotate = (id: string) => {
    if (
      !confirm(
        "Rotate signing secret? Your endpoint must be updated to use the new secret immediately.",
      )
    )
      return;
    runRow(id, async () => {
      const result = await rotateWebhookSecretAction(id);
      if (result.ok) {
        setNewSecret(result.data.signingSecret);
        toast.success("Secret rotated");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this webhook endpoint? It will stop receiving events immediately."))
      return;
    runRow(id, async () => {
      const result = await deleteWebhookEndpointAction(id);
      if (result.ok) {
        toast.success("Endpoint deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleReplay = (id: string) => {
    runRow(id, async () => {
      const result = await replayWebhookDeliveryAction(id);
      if (result.ok) {
        toast.success("Delivery replayed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* New endpoint form */}
      <form
        onSubmit={handleCreate}
        className="border-border bg-background space-y-3 rounded-xl border p-5"
      >
        <h2 className="text-foreground text-base font-bold">Add endpoint</h2>
        <div>
          <label htmlFor="url" className="text-foreground mb-1 block text-sm font-medium">
            HTTPS URL *
          </label>
          <input
            id="url"
            type="url"
            required
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
            placeholder="https://your-app.com/webhooks/arbor"
            className={`${fieldClass} w-full`}
          />
        </div>
        <div>
          <label htmlFor="desc" className="text-foreground mb-1 block text-sm font-medium">
            Description
          </label>
          <input
            id="desc"
            type="text"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            placeholder="Slack #training-ops channel"
            className={`${fieldClass} w-full`}
          />
        </div>
        <div>
          <p className="text-foreground mb-2 text-sm font-medium">Events *</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(e)}
                  onChange={() => {
                    toggleEvent(e);
                  }}
                  className="h-4 w-4"
                />
                <span className="text-foreground font-mono text-xs">{e}</span>
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={pending || !url.trim() || selectedEvents.length === 0}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add endpoint"}
        </button>
      </form>

      {newSecret && (
        <div className="border-warning-bd bg-warning-bg rounded-lg border p-4">
          <p className="text-warning text-sm font-semibold">
            Signing secret (copy now — won&apos;t be shown again)
          </p>
          <pre className="bg-background text-foreground mt-2 overflow-x-auto rounded border p-3 font-mono text-xs">
            {newSecret}
          </pre>
          <button
            type="button"
            onClick={() => {
              setNewSecret(null);
            }}
            className="text-muted-foreground hover:text-foreground mt-2 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Endpoints list */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Endpoints</h2>
        </div>
        {endpoints.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No endpoints yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {endpoints.map((ep) => (
              <li key={ep.id} className="px-5 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate font-mono text-xs">{ep.url}</p>
                    {ep.description && (
                      <p className="text-muted-foreground mt-0.5 text-xs">{ep.description}</p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      Events: <span className="font-mono">{ep.events.join(", ")}</span>
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        handleRotate(ep.id);
                      }}
                      disabled={pendingRowId === ep.id}
                      className="text-primary hover:underline disabled:opacity-50"
                    >
                      {pendingRowId === ep.id ? "Working…" : "Rotate secret"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDelete(ep.id);
                      }}
                      disabled={pendingRowId === ep.id}
                      className="text-destructive hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deliveries log */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Recent deliveries</h2>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">When</th>
                  <th className="px-5 py-2.5 text-left font-medium">Event</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Code</th>
                  <th className="px-5 py-2.5 text-right font-medium">Attempts</th>
                  <th className="px-5 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="text-foreground px-5 py-3 tabular-nums">
                      {d.created_at.replace("T", " ").slice(0, 16)}
                    </td>
                    <td className="text-foreground px-5 py-3 font-mono text-xs">{d.event_type}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {d.response_code?.toString() ?? "—"}
                    </td>
                    <td className="text-foreground px-5 py-3 text-right tabular-nums">
                      {d.attempts.toString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          handleReplay(d.id);
                        }}
                        disabled={pendingRowId === d.id}
                        className="text-primary text-xs hover:underline disabled:opacity-50"
                      >
                        {pendingRowId === d.id ? "Replaying…" : "Replay"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivered: "bg-success-bg text-success",
    failed: "bg-danger-bg text-danger",
    retrying: "bg-warning-bg text-warning",
    pending: "bg-slate-200 text-slate-700",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}
