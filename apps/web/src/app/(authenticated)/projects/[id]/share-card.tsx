"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, ClipboardDocumentIcon, LinkIcon } from "@heroicons/react/20/solid";
import type { Project } from "@arbor/shared";
import { generateShareToken, revokeShareToken } from "../actions";

type Props = { project: Project };

export default function ShareCard({ project }: Props) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const token = project.public_share_token;
  const url =
    typeof window !== "undefined" && token
      ? `${window.location.origin}/public/projects/${token}`
      : "";

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateShareToken(project.id);
      if (result.ok) toast.success("Public share link created");
      else toast.error(result.error.message);
    });
  }

  function handleRevoke() {
    if (!confirm("Revoke the public link? Anyone with the URL will lose access.")) return;
    startTransition(async () => {
      const result = await revokeShareToken(project.id);
      if (result.ok) toast.success("Link revoked");
      else toast.error(result.error.message);
    });
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Public share
      </p>
      {token ? (
        <>
          <p className="text-foreground mt-2 text-sm">
            Anyone with this link can view a read-only project status page — no login required.
          </p>
          <div className="border-input bg-surface mt-2 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
            <LinkIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <code className="text-foreground flex-1 truncate font-mono">{url}</code>
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              aria-label="Copy public share link"
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <CheckIcon className="text-success h-4 w-4" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )}
            </button>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={handleRevoke}
            className="text-destructive mt-3 text-xs hover:underline disabled:opacity-50"
          >
            Revoke link
          </button>
        </>
      ) : (
        <>
          <p className="text-foreground mt-2 text-sm">
            Generate a tokenized read-only link you can paste into stakeholder emails or Slack.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={handleGenerate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <LinkIcon className="h-4 w-4" />
            Generate public link
          </button>
        </>
      )}
    </div>
  );
}
