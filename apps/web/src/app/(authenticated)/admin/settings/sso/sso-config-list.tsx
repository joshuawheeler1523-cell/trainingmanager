"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteSsoConfigAction, upsertSsoConfigAction } from "./actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

type Config = {
  id: string;
  email_domain: string;
  display_name: string | null;
  supabase_provider_id: string | null;
  enabled: boolean;
  created_at: string;
};

export default function SsoConfigList({ configs }: { configs: Config[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [emailDomain, setEmailDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [enabled, setEnabled] = useState(false);

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

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertSsoConfigAction({
        emailDomain,
        displayName,
        supabaseProviderId: providerId,
        enabled,
      });
      if (result.ok) {
        toast.success("SSO config saved");
        setEmailDomain("");
        setDisplayName("");
        setProviderId("");
        setEnabled(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (
      !confirm(
        "Delete this SSO config? Users at the domain will fall back to password / magic link.",
      )
    )
      return;
    runRow(id, async () => {
      const result = await deleteSsoConfigAction(id);
      if (result.ok) {
        toast.success("SSO config deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleToggle = (config: Config) => {
    runRow(config.id, async () => {
      const result = await upsertSsoConfigAction({
        emailDomain: config.email_domain,
        displayName: config.display_name,
        supabaseProviderId: config.supabase_provider_id,
        enabled: !config.enabled,
      });
      if (result.ok) {
        toast.success(`SSO ${config.enabled ? "disabled" : "enabled"} for ${config.email_domain}`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Existing configs */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Configured domains</h2>
        </div>
        {configs.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">
            No SSO configs yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Domain</th>
                  <th className="px-5 py-2.5 text-left font-medium">Display</th>
                  <th className="px-5 py-2.5 text-left font-medium">Provider id</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {configs.map((c) => (
                  <tr key={c.id}>
                    <td className="text-foreground px-5 py-3 font-mono">{c.email_domain}</td>
                    <td className="text-foreground px-5 py-3">{c.display_name ?? "—"}</td>
                    <td className="text-muted-foreground px-5 py-3 font-mono text-xs">
                      {c.supabase_provider_id ?? "(not set)"}
                    </td>
                    <td className="px-5 py-3">
                      {c.enabled ? (
                        <span className="text-success text-xs font-medium">✓ Enabled</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Disabled</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          handleToggle(c);
                        }}
                        disabled={pendingRowId === c.id || !c.supabase_provider_id}
                        className="text-primary mr-3 text-xs hover:underline disabled:opacity-50"
                      >
                        {pendingRowId === c.id ? "…" : c.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(c.id);
                        }}
                        disabled={pendingRowId === c.id}
                        className="text-destructive text-xs hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add new */}
      <form
        onSubmit={handleSubmit}
        className="border-border bg-background space-y-4 rounded-xl border p-5"
      >
        <h2 className="text-foreground text-base font-bold">Add SSO config</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="domain" className="text-foreground mb-1 block text-sm font-medium">
              Email domain *
            </label>
            <input
              id="domain"
              type="text"
              required
              value={emailDomain}
              onChange={(e) => {
                setEmailDomain(e.target.value);
              }}
              placeholder="mercy-health.com"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="display" className="text-foreground mb-1 block text-sm font-medium">
              Display name
            </label>
            <input
              id="display"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
              }}
              placeholder="Mercy AzureAD"
              className={fieldClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="provider" className="text-foreground mb-1 block text-sm font-medium">
            Supabase provider id
          </label>
          <input
            id="provider"
            type="text"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
            }}
            placeholder="UUID issued after Arbor support registers your SAML metadata"
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Leave blank to save the domain placeholder; provider id can be added later. SSO is only
            active when this is set AND Enabled is on.
          </p>
        </div>
        <label
          className={`flex items-center gap-2 text-sm ${providerId.trim() ? "" : "opacity-50"}`}
        >
          <input
            type="checkbox"
            checked={enabled && Boolean(providerId.trim())}
            disabled={!providerId.trim()}
            onChange={(e) => {
              setEnabled(e.target.checked);
            }}
            className="h-4 w-4"
          />
          <span className="text-foreground">
            Enable for this domain
            {!providerId.trim() && (
              <span className="text-muted-foreground ml-1 text-xs">(provider id required)</span>
            )}
          </span>
        </label>
        <div>
          <button
            type="submit"
            disabled={pending || !emailDomain.trim()}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
