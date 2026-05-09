"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
} from "@heroicons/react/20/solid";
import PageHeader from "@/components/ui/page-header";
import Step1Basics from "./step-1-basics";
import Step2Need from "./step-2-need";
import Step3Audience from "./step-3-audience";
import Step4BusinessCase from "./step-4-business-case";
import Step5LearningDesign from "./step-5-learning-design";
import Step6Logistics from "./step-6-logistics";
import Step7Sustainment from "./step-7-sustainment";
import Step8Approvals from "./step-8-approvals";
import Step9Review from "./step-9-review";
import AiAssistantPanel from "./ai-assistant-panel";
import {
  archiveTra,
  cancelTra,
  convertTraToProject,
  markTraComplete,
  markTraDocumented,
  reopenTra,
  unarchiveTra,
} from "../actions";
import type {
  DeliverableType,
  Tra,
  TraApproval,
  TraAudienceRole,
  TraDeliverable,
  TraEvaluationPlan,
  TraKpi,
  TraObjective,
  TraSme,
  TraStakeholder,
  TraStatus,
  TraSuccessCriteria,
} from "@arbor/shared";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Basics" },
  { id: 2, label: "The need" },
  { id: 3, label: "Audience" },
  { id: 4, label: "Business case" },
  { id: 5, label: "Learning design" },
  { id: 6, label: "Logistics" },
  { id: 7, label: "Sustainment" },
  { id: 8, label: "Approvals" },
  { id: 9, label: "Review & generate" },
];

const STATUS_BADGE: Record<TraStatus, string> = {
  draft: "bg-surface text-muted-foreground",
  documented: "bg-primary/10 text-primary",
  converted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "bg-destructive/10 text-destructive",
};

type Props = {
  tra: Tra;
  stakeholders: TraStakeholder[];
  audienceRoles: TraAudienceRole[];
  kpis: TraKpi[];
  successCriteria: TraSuccessCriteria[];
  objectives: TraObjective[];
  smes: TraSme[];
  evaluationPlan: TraEvaluationPlan[];
  approvals: TraApproval[];
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  aiAssistantEnabled: boolean;
};

export default function TraWizard({
  tra,
  stakeholders,
  audienceRoles,
  kpis,
  successCriteria,
  objectives,
  smes,
  evaluationPlan,
  approvals,
  deliverables,
  deliverableTypes,
  aiAssistantEnabled,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [aiOpen, setAiOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Locked = no further editing. Converted ties to a project; completed
  // and cancelled are terminal end-states. Reopen sends them back to
  // documented if the user changes their mind.
  const isLocked =
    tra.status === "converted" || tra.status === "completed" || tra.status === "cancelled";
  const isArchived = tra.archived_at != null;

  function runAction(
    label: string,
    fn: () => Promise<{ ok: true; data: Tra } | { ok: false; error: { message: string } }>,
  ) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(label);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  function handleDocument() {
    runAction("Marked as documented", () => markTraDocumented(tra.id));
  }
  function handleComplete() {
    runAction("Marked complete", () => markTraComplete(tra.id));
  }
  function handleCancel() {
    runAction("Cancelled", () => cancelTra(tra.id));
  }
  function handleReopen() {
    runAction("Reopened", () => reopenTra(tra.id));
  }
  function handleArchive() {
    runAction("Archived", () => archiveTra(tra.id));
  }
  function handleUnarchive() {
    runAction("Restored", () => unarchiveTra(tra.id));
  }

  function handleConvert() {
    startTransition(async () => {
      const result = await convertTraToProject(tra.id);
      if (result.ok) {
        toast.success(`Converted — ${String(result.data.task_count)} tasks created`);
        router.push(`/projects/${result.data.project_id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div>
      <PageHeader
        title={tra.project_name}
        description={
          tra.requesting_department
            ? `Training Request Assessment · ${tra.requesting_department}`
            : "Training Request Assessment"
        }
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[tra.status]}`}
            >
              {tra.status}
            </span>
            {aiAssistantEnabled && (
              <button
                type="button"
                onClick={() => {
                  setAiOpen(true);
                }}
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                AI assistant
              </button>
            )}
          </div>
        }
      />

      {/* Step indicator */}
      <div className="border-border bg-background border-b px-6 py-3">
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setStep(s.id);
                }}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  step === s.id
                    ? "bg-primary text-primary-foreground"
                    : step > s.id
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="tabular-nums">
                  {step > s.id ? <CheckCircleIcon className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="p-6">
        {step === 1 && <Step1Basics tra={tra} stakeholders={stakeholders} disabled={isLocked} />}
        {step === 2 && <Step2Need tra={tra} disabled={isLocked} />}
        {step === 3 && (
          <Step3Audience tra={tra} audienceRoles={audienceRoles} disabled={isLocked} />
        )}
        {step === 4 && (
          <Step4BusinessCase
            tra={tra}
            kpis={kpis}
            successCriteria={successCriteria}
            disabled={isLocked}
          />
        )}
        {step === 5 && (
          <Step5LearningDesign
            tra={tra}
            objectives={objectives}
            smes={smes}
            evaluationPlan={evaluationPlan}
            deliverables={deliverables}
            deliverableTypes={deliverableTypes}
            disabled={isLocked}
          />
        )}
        {step === 6 && <Step6Logistics tra={tra} disabled={isLocked} />}
        {step === 7 && <Step7Sustainment tra={tra} disabled={isLocked} />}
        {step === 8 && <Step8Approvals traId={tra.id} approvals={approvals} disabled={isLocked} />}
        {step === 9 && (
          <Step9Review
            tra={tra}
            objectives={objectives}
            deliverables={deliverables}
            deliverableTypes={deliverableTypes}
            pending={pending}
            isArchived={isArchived}
            onDocument={handleDocument}
            onComplete={handleComplete}
            onCancel={handleCancel}
            onReopen={handleReopen}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
            onConvert={handleConvert}
            goToStep={(n) => {
              setStep(n as Step);
            }}
          />
        )}
      </div>

      {/* Footer nav */}
      <div className="border-border bg-background sticky bottom-0 flex items-center justify-between border-t px-6 py-3">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => {
            setStep((s) => (s - 1) as Step);
          }}
          className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </button>
        <span className="text-muted-foreground text-xs tabular-nums">
          Step {step} of {STEPS.length}
        </span>
        <button
          type="button"
          disabled={step === STEPS.length}
          onClick={() => {
            setStep((s) => (s + 1) as Step);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Next
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {aiOpen && (
        <AiAssistantPanel
          onClose={() => {
            setAiOpen(false);
          }}
          enabled={aiAssistantEnabled}
        />
      )}
    </div>
  );
}
