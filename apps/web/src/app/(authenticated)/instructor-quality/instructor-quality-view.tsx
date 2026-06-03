"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  QrCodeIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
} from "@heroicons/react/20/solid";
import { generateFeedbackLink, recordQualityScore, setFeedbackLinkActive } from "./actions";
import InstructorQualityScorecard from "@/components/instructor-quality-scorecard";
import type { InstructorQuality } from "@/lib/instructor-quality";

export type InstructorRow = {
  id: string;
  name: string;
  department: string | null;
  quality: InstructorQuality;
};

export type DeliverableRow = {
  key: string;
  sourceType: string;
  sourceId: string;
  departmentId: string;
  label: string;
  instructorNames: string[];
  link: { id: string; token: string; isActive: boolean; url: string; qr: string } | null;
};

const SOURCE_LABEL: Record<string, string> = {
  class: "Class",
  recurring_task: "Recurring",
  ad_hoc_task: "Ad-hoc",
  education_request: "Education request",
  project_task: "Project / session",
};

type Tab = "quality" | "codes";

export default function InstructorQualityView({
  instructors,
  deliverables,
  peerOverall,
}: {
  instructors: InstructorRow[];
  deliverables: DeliverableRow[];
  peerOverall: number | null;
}) {
  const [tab, setTab] = useState<Tab>("quality");

  return (
    <div>
      <div className="border-border mb-5 flex gap-6 border-b">
        {(
          [
            { id: "quality", label: "Quality (Kirkpatrick)" },
            { id: "codes", label: "Feedback codes" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
            }}
            className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "quality" ? (
        <QualityTab instructors={instructors} peerOverall={peerOverall} />
      ) : (
        <CodesTab deliverables={deliverables} />
      )}
    </div>
  );
}

// ── Quality (Kirkpatrick) ────────────────────────────────────────────────────

function QualityTab({
  instructors,
  peerOverall,
}: {
  instructors: InstructorRow[];
  peerOverall: number | null;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Reaction (L1) comes from learner QR feedback, broken out by work type. Learning, Behavior
          &amp; Results (L2–L4) are recorded by managers.
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <PlusIcon className="h-4 w-4" />
          Add L2–L4 score
        </button>
      </div>

      {adding && (
        <ScoreForm
          instructors={instructors.map((i) => ({ id: i.id, name: i.name }))}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}

      {instructors.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">No instructors in scope.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {instructors.map((i) => (
            <div key={i.id} className="border-border bg-background rounded-xl border p-4">
              <div className="mb-3">
                <span className="text-foreground text-sm font-semibold">{i.name}</span>
                {i.department && (
                  <span className="text-muted-foreground ml-2 text-xs">{i.department}</span>
                )}
              </div>
              <InstructorQualityScorecard data={i.quality} peerOverall={peerOverall} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreForm({
  instructors,
  onClose,
}: {
  instructors: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? "");
  const [level, setLevel] = useState(2);
  const [metric, setMetric] = useState("");
  const [score, setScore] = useState("");
  const [scoreMax, setScoreMax] = useState("100");
  const [period, setPeriod] = useState("");

  const inputCls =
    "border-input bg-background text-foreground focus:ring-ring rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2";

  function submit() {
    setError(null);
    const s = Number(score);
    if (!instructorId) {
      setError("Pick an instructor.");
      return;
    }
    if (!metric.trim()) {
      setError("Name the metric.");
      return;
    }
    if (Number.isNaN(s)) {
      setError("Enter a numeric score.");
      return;
    }
    startTransition(async () => {
      const result = await recordQualityScore({
        instructorId,
        kirkpatrickLevel: level,
        metric: metric.trim(),
        score: s,
        scoreMax: Number(scoreMax) || 100,
        periodLabel: period,
      });
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Instructor</span>
          <select
            value={instructorId}
            onChange={(e) => {
              setInstructorId(e.target.value);
            }}
            className={`${inputCls} w-full`}
          >
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Kirkpatrick level</span>
          <select
            value={level}
            onChange={(e) => {
              setLevel(Number(e.target.value));
            }}
            className={`${inputCls} w-full`}
          >
            <option value={2}>L2 — Learning</option>
            <option value={3}>L3 — Behavior</option>
            <option value={4}>L4 — Results</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Metric</span>
          <input
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value);
            }}
            placeholder="e.g. Competency pass rate"
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Score</span>
          <input
            value={score}
            onChange={(e) => {
              setScore(e.target.value);
            }}
            placeholder="94"
            inputMode="decimal"
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Out of</span>
          <input
            value={scoreMax}
            onChange={(e) => {
              setScoreMax(e.target.value);
            }}
            placeholder="100"
            inputMode="decimal"
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mb-1 block">Period (optional)</span>
          <input
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
            }}
            placeholder="e.g. 30-day, Q3"
            className={`${inputCls} w-full`}
          />
        </label>
      </div>
      {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="border-border text-foreground hover:bg-background rounded-md border px-3 py-1.5 text-xs font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save score"}
        </button>
      </div>
    </div>
  );
}

// ── Feedback codes ───────────────────────────────────────────────────────────

function CodesTab({ deliverables }: { deliverables: DeliverableRow[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, DeliverableRow[]>();
    for (const d of deliverables) {
      const list = m.get(d.sourceType) ?? [];
      list.push(d);
      m.set(d.sourceType, list);
    }
    return Array.from(m.entries());
  }, [deliverables]);

  if (deliverables.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          No deliverables with assigned instructors yet. Assign instructors to classes / projects to
          generate feedback codes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">
        Generate a QR code for any deliverable. Display it at the end of a session (slide, printed
        card, or email) — learners scan it, pick the instructor, and leave anonymous feedback.
      </p>
      {grouped.map(([type, rows]) => (
        <section key={type}>
          <h3 className="text-foreground mb-2 text-sm font-semibold">
            {SOURCE_LABEL[type] ?? type}
          </h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((d) => (
              <DeliverableCard key={d.key} row={d} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DeliverableCard({ row }: { row: DeliverableRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function generate() {
    startTransition(async () => {
      await generateFeedbackLink({
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        label: row.label,
      });
      router.refresh();
    });
  }

  function toggleActive(active: boolean) {
    const link = row.link;
    if (!link) return;
    startTransition(async () => {
      await setFeedbackLinkActive(link.id, active);
      router.refresh();
    });
  }

  function copy() {
    const link = row.link;
    if (!link) return;
    void navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  function print() {
    const link = row.link;
    if (!link) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.title = row.label;
    w.document.body.style.cssText = "font-family:sans-serif;text-align:center;padding:40px";
    w.document.body.innerHTML =
      `<h2 style="margin:0 0 4px">${escapeHtml(row.label)}</h2>` +
      `<p style="color:#666;margin:0 0 20px">Scan to rate your instructor</p>` +
      `<img src="${link.qr}" width="300" height="300" alt="" />` +
      `<p style="color:#999;font-size:12px;margin-top:16px">Powered by Arbor</p>`;
    w.focus();
    setTimeout(() => {
      w.print();
    }, 150);
  }

  return (
    <div className="border-border bg-background flex gap-4 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">{row.label}</p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {row.instructorNames.length > 0 ? row.instructorNames.join(", ") : "No instructor"}
        </p>
        {row.link ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copy}
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              >
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={print}
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              >
                <PrinterIcon className="h-3.5 w-3.5" />
                Print
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  toggleActive(!row.link?.isActive);
                }}
                className="text-muted-foreground hover:text-foreground inline-flex items-center px-1 py-1 text-xs"
              >
                {row.link.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
            {!row.link.isActive && (
              <p className="text-warning text-xs">Inactive — not collecting.</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={generate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <QrCodeIcon className="h-4 w-4" />
            {pending ? "Generating…" : "Generate code"}
          </button>
        )}
      </div>
      {row.link?.qr && (
        <Image
          src={row.link.qr}
          alt="Feedback QR code"
          width={88}
          height={88}
          className="border-border h-[88px] w-[88px] shrink-0 rounded-md border"
          unoptimized
        />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
