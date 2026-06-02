"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/20/solid";

type Props = {
  enabled: boolean;
  onClose: () => void;
};

// Side panel for the AI Assistant. The actual call to the `tra-suggest`
// Supabase Edge Function isn't deployed yet — the panel currently shows a
// "not yet wired up" state. When the edge function is live and an
// ANTHROPIC_API_KEY is configured, we'll replace the body with:
//   1) a textarea for the description
//   2) a "Generate suggestions" button that POSTs to supabase.functions.invoke
//   3) a list of suggested deliverables with an "Apply" button per row that
//      calls addDeliverable()

export default function AiAssistantPanel({ enabled, onClose }: Props) {
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:slide-in-from-right fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l shadow-xl">
          <div className="border-border flex items-start justify-between border-b px-6 py-4">
            <div className="flex items-center gap-2">
              <SparklesIcon className="text-primary h-5 w-5" />
              <div>
                <Dialog.Title className="text-foreground text-base font-semibold">
                  AI Assistant
                </Dialog.Title>
                <Dialog.Description className="text-muted-foreground mt-0.5 text-xs">
                  Suggest deliverables from a short description.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {enabled ? <UnconfiguredState /> : <DisabledState />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UnconfiguredState() {
  return (
    <div className="space-y-4">
      <div className="border-warning-bd bg-warning-bg rounded-md border p-4">
        <p className="text-foreground text-sm font-medium">AI Assistant not yet configured</p>
        <p className="text-muted-foreground mt-1 text-xs">
          The <code className="bg-surface rounded px-1">ai_estimation</code> feature flag is on for
          this org, but the <code className="bg-surface rounded px-1">tra-suggest</code> Supabase
          Edge Function hasn&apos;t been deployed yet, or the{" "}
          <code className="bg-surface rounded px-1">ANTHROPIC_API_KEY</code> secret isn&apos;t set.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <p className="text-foreground font-medium">Once configured, this panel will let you:</p>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
          <li>Type a short description of the training need</li>
          <li>Get a list of suggested deliverables matching the catalog</li>
          <li>Apply one or all suggestions directly into the deliverables step</li>
        </ul>
      </div>

      <div className="border-border bg-surface rounded-md border p-3">
        <p className="text-muted-foreground text-xs">Setup steps for the operator:</p>
        <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-1 text-xs">
          <li>
            Add <code className="bg-background rounded px-1">ANTHROPIC_API_KEY</code> to Supabase
            project secrets.
          </li>
          <li>
            Deploy the <code className="bg-background rounded px-1">tra-suggest</code> edge function
            (script will land in a follow-up commit).
          </li>
        </ol>
      </div>
    </div>
  );
}

function DisabledState() {
  return (
    <div className="space-y-3">
      <div className="border-border bg-surface rounded-md border p-4">
        <p className="text-foreground text-sm font-medium">AI Assistant is disabled for your org</p>
        <p className="text-muted-foreground mt-1 text-xs">
          To turn it on, an admin can flip the{" "}
          <code className="bg-background rounded px-1">ai_estimation</code> feature flag.
        </p>
      </div>
    </div>
  );
}
