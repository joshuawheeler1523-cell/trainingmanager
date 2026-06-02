"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircleIcon, ClipboardIcon } from "@heroicons/react/20/solid";
import { PRESET_LIST, type PresetKey } from "@arbor/shared";
import { agencyInviteOrgMemberAction, createClientOrgAction } from "../../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

type CreatedOrg = { orgId: string; slug: string; name: string };

export default function NewClientOrgForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [presetKey, setPresetKey] = useState<PresetKey>("hospital_training");
  const [created, setCreated] = useState<CreatedOrg | null>(null);

  const handleCreate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createClientOrgAction({
        name,
        slug: slug.trim() === "" ? undefined : slug.trim(),
        presetKey,
      });
      if (result.ok) {
        toast.success(`Client org "${name}" created`);
        setCreated({ orgId: result.data.orgId, slug: result.data.slug, name });
      } else {
        toast.error(result.error.message);
      }
    });
  };

  if (created) {
    return (
      <InviteManagerStep
        created={created}
        onDone={() => {
          router.push("/agency");
        }}
      />
    );
  }

  return (
    <form onSubmit={handleCreate} className="space-y-5">
      <div>
        <label htmlFor="name" className="text-foreground mb-1 block text-sm font-medium">
          Organization name *
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="e.g. Mercy Health Training"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="slug" className="text-foreground mb-1 block text-sm font-medium">
          Slug (optional)
        </label>
        <input
          id="slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
          }}
          placeholder="auto-generated from name if blank"
          className={fieldClass}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Lowercase letters, numbers, and hyphens. Must be unique across all of Arbor.
        </p>
      </div>

      <div>
        <label htmlFor="preset" className="text-foreground mb-1 block text-sm font-medium">
          Workspace preset
        </label>
        <select
          id="preset"
          value={presetKey}
          onChange={(e) => {
            setPresetKey(e.target.value as PresetKey);
          }}
          className={fieldClass}
        >
          {PRESET_LIST.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1 text-xs">
          Determines initial modules enabled + terminology defaults. Manager can change later via
          the org&apos;s workspace identity settings.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Provisioning…" : "Create client org"}
        </button>
      </div>
    </form>
  );
}

function InviteManagerStep({ created, onDone }: { created: CreatedOrg; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [sentLink, setSentLink] = useState<{ acceptUrl: string; delivered: boolean } | null>(null);

  function handleInvite(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await agencyInviteOrgMemberAction({
        orgId: created.orgId,
        email,
        role: "manager",
      });
      if (result.ok) {
        setSentLink({ acceptUrl: result.data.acceptUrl, delivered: result.data.emailDelivered });
        toast.success(
          result.data.emailDelivered
            ? `Invitation emailed to ${email}`
            : `Invite link created (email degraded — copy the link below)`,
        );
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="border-border bg-success-bg/40 flex items-start gap-3 rounded-lg border p-4">
        <CheckCircleIcon className="text-success mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">
            <span className="font-bold">{created.name}</span> is ready
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Slug: <span className="font-mono">{created.slug}</span> · You&apos;re the default
            manager. Once the org&apos;s own manager accepts an invite, you can step back.
          </p>
        </div>
      </div>

      {sentLink ? (
        <div className="space-y-4">
          <div className="border-border bg-background rounded-lg border p-5">
            <p className="text-foreground text-sm font-semibold">
              {sentLink.delivered ? "Invitation sent" : "Invite link generated"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {sentLink.delivered
                ? `${email} will receive an email with the accept link. If they don't see it, you can copy the link below as a fallback.`
                : `Email delivery is degraded (Resend likely not configured). Share this link with ${email} so they can sign in:`}
            </p>
            <div className="border-border bg-surface mt-3 flex items-center gap-2 rounded-md border p-2 text-xs">
              <code className="text-foreground flex-1 truncate font-mono">
                {sentLink.acceptUrl}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(sentLink.acceptUrl);
                  toast.success("Link copied");
                }}
                className="border-border text-foreground hover:bg-background inline-flex items-center gap-1 rounded border px-2 py-1"
              >
                <ClipboardIcon className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSentLink(null);
                setEmail("");
              }}
              className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
            >
              Invite another
            </button>
            <Link
              href={`/?org=${created.orgId}`}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Open the org workspace →
            </Link>
            <button
              type="button"
              onClick={onDone}
              className="bg-primary text-primary-foreground ml-auto rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label
              htmlFor="invite-email"
              className="text-foreground mb-1 block text-sm font-medium"
            >
              Invite the org&apos;s manager
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="manager@hospital.org"
              className={fieldClass}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              They&apos;ll get an email with a one-click accept link. They&apos;ll be added as a
              manager and can invite their own team after signing in.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !email.trim()}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send invite"}
            </button>
            <button
              type="button"
              onClick={onDone}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground rounded-md px-4 py-2 text-sm font-medium"
            >
              Skip — I&apos;ll invite later
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
