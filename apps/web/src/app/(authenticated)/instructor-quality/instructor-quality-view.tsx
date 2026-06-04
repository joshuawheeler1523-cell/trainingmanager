"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  QrCodeIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
  PhotoIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/20/solid";
import {
  addFeedbackQuestion,
  deleteFeedbackQuestion,
  generateFeedbackLink,
  recordQualityScore,
  setFeedbackLinkActive,
} from "./actions";
import InstructorQualityScorecard from "@/components/instructor-quality-scorecard";
import type { InstructorQuality } from "@/lib/instructor-quality";

export type InstructorRow = {
  id: string;
  name: string;
  department: string | null;
  quality: InstructorQuality;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type DeliverableRow = {
  key: string;
  sourceType: string;
  sourceId: string;
  departmentId: string;
  label: string;
  instructorNames: string[];
  link: {
    id: string;
    token: string;
    isActive: boolean;
    url: string;
    qr: string;
    svg: string;
  } | null;
  questions: QuizQuestion[];
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
        <p className="text-muted-foreground max-w-3xl text-xs leading-relaxed">
          <span className="text-foreground font-medium">Reaction (L1)</span> is learner QR feedback,
          broken out by work type and trend.{" "}
          <span className="text-foreground font-medium">Learning · Behavior · Results (L2–L4)</span>{" "}
          is an optional outcomes log you fill from your own assessments or operational data — it is
          not measured by the QR. A program-effectiveness and learning signal; it does not establish
          individual competency (e.g. Joint Commission HR.01.06.01).
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <PlusIcon className="h-4 w-4" />
          Add outcome metric
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
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        Outcomes log — record a learning, behavior, or results metric from your own assessment or
        operational data. Not measured by the QR, and not a competency determination.
      </p>
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
            placeholder="e.g. Post-test average, Audit compliance %"
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
  const [imgResult, setImgResult] = useState<"" | "copied" | "downloaded">("");
  const [announce, setAnnounce] = useState("");

  function say(message: string) {
    setAnnounce(message);
    setTimeout(() => {
      setAnnounce("");
    }, 2000);
  }

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
    say("Feedback link copied");
  }

  // Copy the QR image itself to the clipboard so it can be pasted straight onto
  // an outside deliverable (slide, doc, email). Construct the ClipboardItem with
  // a Blob promise — Safari requires the value resolve within the user gesture.
  // Where the async Clipboard API is unavailable (or rejects) we fall back to a
  // PNG download and say so, so the button feedback always matches what happened.
  async function copyImage() {
    const link = row.link;
    if (!link || !link.qr) return;
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": fetch(link.qr).then((r) => r.blob()) }),
        ]);
        setImgResult("copied");
        setTimeout(() => {
          setImgResult("");
        }, 1500);
        say("QR image copied to clipboard");
        return;
      }
    } catch {
      // fall through to download
    }
    triggerDownload(link.qr, qrFilename(row.label, link.token, "png"));
    setImgResult("downloaded");
    setTimeout(() => {
      setImgResult("");
    }, 1500);
    say("Clipboard unavailable — saved a PNG to your downloads");
  }

  function downloadPng() {
    const link = row.link;
    if (!link || !link.qr) return;
    triggerDownload(link.qr, qrFilename(row.label, link.token, "png"));
    say("PNG downloaded");
  }

  function downloadSvg() {
    const link = row.link;
    if (!link || !link.svg) return;
    const blobUrl = URL.createObjectURL(new Blob([link.svg], { type: "image/svg+xml" }));
    triggerDownload(blobUrl, qrFilename(row.label, link.token, "svg"));
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);
    say("SVG downloaded");
  }

  function print() {
    const link = row.link;
    if (!link || !link.qr) return;
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
            <div className="flex flex-wrap items-center gap-2">
              {row.link.qr && (
                <button
                  type="button"
                  onClick={() => {
                    void copyImage();
                  }}
                  className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
                  title="Copy the QR image to paste onto a slide, doc, or flyer"
                >
                  <PhotoIcon className="h-3.5 w-3.5" />
                  {imgResult === "copied"
                    ? "Copied!"
                    : imgResult === "downloaded"
                      ? "Saved PNG"
                      : "Copy image"}
                </button>
              )}
              <button
                type="button"
                onClick={copy}
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                title="Copy the feedback URL"
              >
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy link"}
              </button>
              {row.link.qr && (
                <>
                  <button
                    type="button"
                    onClick={downloadPng}
                    className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    title="Download a PNG image"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    PNG
                  </button>
                  <button
                    type="button"
                    onClick={downloadSvg}
                    className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    title="Download a vector SVG — stays sharp at any print size"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    SVG
                  </button>
                  <button
                    type="button"
                    onClick={print}
                    className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    title="Open a printable QR card"
                  >
                    <PrinterIcon className="h-3.5 w-3.5" />
                    Print
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  toggleActive(!row.link?.isActive);
                }}
                className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center px-1 py-1 text-xs"
                title={
                  row.link.isActive
                    ? "Stop collecting feedback for this deliverable"
                    : "Resume collecting feedback"
                }
              >
                {row.link.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
            {!row.link.isActive && (
              <p className="text-warning text-xs">Inactive — not collecting.</p>
            )}
            <span aria-live="polite" className="sr-only">
              {announce}
            </span>
            <QuizEditor linkId={row.link.id} questions={row.questions} />
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

// Manager-authored knowledge check (objective L2) for a deliverable's link.
// The correct answer is stored server-side and never served to the QR form.
function QuizEditor({ linkId, questions }: { linkId: string; questions: QuizQuestion[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPrompt("");
    setOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setError(null);
    setAdding(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await addFeedbackQuestion({ linkId, prompt, options, correctIndex });
      if (result.ok) {
        reset();
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteFeedbackQuestion(id);
      router.refresh();
    });
  }

  const fieldCls =
    "border-input bg-background text-foreground focus:ring-ring rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2";

  return (
    <div className="border-border mt-1 border-t pt-2">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <QrCodeIcon className="h-3.5 w-3.5" />
        Knowledge check ({questions.length})<span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {questions.length === 0 && !adding && (
            <p className="text-muted-foreground text-xs">
              Add 2–5 questions to score what learners actually retained (objective L2). Optional.
            </p>
          )}
          {questions.map((q, qi) => (
            <div key={q.id} className="border-border bg-surface rounded-md border p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground font-medium">
                  {qi + 1}. {q.prompt}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    remove(q.id);
                  }}
                  className="text-muted-foreground hover:text-danger shrink-0"
                  title="Delete question"
                >
                  ✕
                </button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {q.options.map((o, oi) => (
                  <li
                    key={oi}
                    className={oi === q.correctIndex ? "text-success" : "text-muted-foreground"}
                  >
                    {oi === q.correctIndex ? "✓ " : "· "}
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {adding ? (
            <div className="border-border bg-surface space-y-2 rounded-md border p-2">
              <input
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                }}
                placeholder="Question"
                className={`${fieldCls} w-full`}
              />
              {options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${linkId}`}
                    checked={correctIndex === oi}
                    onChange={() => {
                      setCorrectIndex(oi);
                    }}
                    title="Mark as the correct answer"
                  />
                  <input
                    value={o}
                    onChange={(e) => {
                      setOptions((prev) => prev.map((p, i) => (i === oi ? e.target.value : p)));
                    }}
                    placeholder={`Option ${String(oi + 1)}${oi > 1 ? " (optional)" : ""}`}
                    className={`${fieldCls} flex-1`}
                  />
                </label>
              ))}
              {error && <p className="text-danger text-xs">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={save}
                  className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save question"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="text-muted-foreground hover:text-foreground px-2 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
              <p className="text-muted-foreground text-[10px]">
                The ✓ option is the answer key — stored privately and never shown on the QR form.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
              }}
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add question
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "code"
  );
}

// Always append a short token hash so non-Latin or duplicate labels (which
// slugify down to the same "code") still produce unique, traceable filenames.
function qrFilename(label: string, token: string, ext: string): string {
  return `feedback-qr-${slugify(label)}-${token.slice(0, 6)}.${ext}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
