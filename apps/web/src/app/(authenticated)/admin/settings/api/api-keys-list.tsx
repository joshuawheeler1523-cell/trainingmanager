"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

type Key = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export default function ApiKeysList({ keys }: { keys: Key[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"live" | "test">("live");
  const [newKey, setNewKey] = useState<string | null>(null);

  const handleCreate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createApiKeyAction({ name, env });
      if (result.ok) {
        setNewKey(result.data.fullKey);
        setName("");
        toast.success("API key created — copy it now, it won't be shown again");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleRevoke = (id: string) => {
    if (!confirm("Revoke this key? Any client using it will start getting 401s immediately."))
      return;
    startTransition(async () => {
      const result = await revokeApiKeyAction(id);
      if (result.ok) {
        toast.success("Key revoked");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="border-border bg-background flex items-end gap-3 rounded-xl border p-5"
      >
        <div className="flex-1">
          <label htmlFor="key-name" className="text-foreground mb-1 block text-sm font-medium">
            New key name
          </label>
          <input
            id="key-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="Workday sync"
            className={`${fieldClass} w-full`}
            required
          />
        </div>
        <div>
          <label htmlFor="key-env" className="text-foreground mb-1 block text-sm font-medium">
            Env
          </label>
          <select
            id="key-env"
            value={env}
            onChange={(e) => {
              setEnv(e.target.value as "live" | "test");
            }}
            className={fieldClass}
          >
            <option value="live">live</option>
            <option value="test">test</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>

      {newKey && (
        <div className="border-warning-bd bg-warning-bg rounded-lg border p-4">
          <p className="text-warning text-sm font-semibold">
            Your new API key (copy now — it won&apos;t be shown again)
          </p>
          <pre className="bg-background text-foreground mt-2 overflow-x-auto rounded border p-3 font-mono text-xs">
            {newKey}
          </pre>
          <button
            type="button"
            onClick={() => {
              setNewKey(null);
            }}
            className="text-muted-foreground hover:text-foreground mt-2 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Existing keys</h2>
        </div>
        {keys.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">No API keys yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Name</th>
                  <th className="px-5 py-2.5 text-left font-medium">Prefix</th>
                  <th className="px-5 py-2.5 text-left font-medium">Created</th>
                  <th className="px-5 py-2.5 text-left font-medium">Last used</th>
                  <th className="px-5 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {keys.map((k) => (
                  <tr key={k.id} className={k.revoked_at ? "opacity-60" : ""}>
                    <td className="text-foreground px-5 py-3 font-medium">{k.name}</td>
                    <td className="text-muted-foreground px-5 py-3 font-mono">{k.key_prefix}…</td>
                    <td className="text-foreground px-5 py-3 tabular-nums">
                      {k.created_at.slice(0, 10)}
                    </td>
                    <td className="text-foreground px-5 py-3 tabular-nums">
                      {k.last_used_at ? k.last_used_at.slice(0, 10) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {k.revoked_at ? (
                        <span className="text-muted-foreground text-xs">Revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            handleRevoke(k.id);
                          }}
                          disabled={pending}
                          className="text-destructive text-xs hover:underline disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
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
