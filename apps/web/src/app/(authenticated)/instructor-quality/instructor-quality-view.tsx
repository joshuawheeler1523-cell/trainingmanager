"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  QrCodeIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
  PhotoIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/20/solid";
import { generateFeedbackLink, setFeedbackLinkActive } from "./actions";

// One anonymous QR survey response (a learner rating one instructor).
export type FeedbackResponse = {
  instructorId: string;
  sourceType: string;
  overall: number | null;
  knowledge: number | null;
  clarity: number | null;
  engagement: number | null;
  pace: number | null;
  recommend: number | null;
  submittedAt: string;
};

export type ReportInstructor = {
  id: string;
  name: string;
  department: string | null;
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
  responses,
  instructors,
  deliverables,
}: {
  responses: FeedbackResponse[];
  instructors: ReportInstructor[];
  deliverables: DeliverableRow[];
}) {
  const [tab, setTab] = useState<Tab>("quality");

  return (
    <div>
      <div className="border-border mb-5 flex gap-6 border-b">
        {(
          [
            { id: "quality", label: "Quality report" },
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
        <QualityReport responses={responses} instructors={instructors} />
      ) : (
        <CodesTab deliverables={deliverables} />
      )}
    </div>
  );
}

// ── Quality report (filterable, sortable — all from the QR survey)

const WORK_TYPES = [
  { value: "all", label: "All work types" },
  { value: "class", label: "Classes" },
  { value: "education_request", label: "Education deliverables" },
] as const;

const DATE_RANGES = [
  { value: "all", label: "All time", days: null },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "Last 12 months", days: 365 },
] as const;

type TraitKey = "overall" | "knowledge" | "clarity" | "engagement" | "pace";
type SortKey = "name" | "responses" | TraitKey | "nps";

const TRAIT_COLS: { key: TraitKey; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "knowledge", label: "Knowledge" },
  { key: "clarity", label: "Clarity" },
  { key: "engagement", label: "Engagement" },
  { key: "pace", label: "Pace" },
];

type ReportRow = {
  id: string;
  name: string;
  department: string | null;
  responses: number;
  overall: number | null;
  knowledge: number | null;
  clarity: number | null;
  engagement: number | null;
  pace: number | null;
  nps: number | null;
};

function avgOf(nums: number[]): number | null {
  return nums.length === 0
    ? null
    : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function fmtCell(v: number | null): string {
  return v == null ? "—" : v.toFixed(1);
}

function QualityReport({
  responses,
  instructors,
}: {
  responses: FeedbackResponse[];
  instructors: ReportInstructor[];
}) {
  const [workType, setWorkType] = useState<string>("all");
  const [range, setRange] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<ReportRow[]>(() => {
    const days = DATE_RANGES.find((d) => d.value === range)?.days ?? null;
    const cutoff = days != null ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
    const byId = new Map(instructors.map((i) => [i.id, i] as const));
    const groups = new Map<string, FeedbackResponse[]>();
    for (const r of responses) {
      if (workType !== "all" && r.sourceType !== workType) continue;
      if (cutoff != null && new Date(r.submittedAt).getTime() < cutoff) continue;
      if (!byId.has(r.instructorId)) continue;
      const list = groups.get(r.instructorId) ?? [];
      list.push(r);
      groups.set(r.instructorId, list);
    }
    const out: ReportRow[] = [];
    for (const [id, list] of groups) {
      const inst = byId.get(id);
      if (!inst) continue;
      const pick = (k: TraitKey) =>
        avgOf(list.map((r) => r[k]).filter((v): v is number => v != null));
      const rec = list.map((r) => r.recommend).filter((v): v is number => v != null);
      const nps =
        rec.length === 0
          ? null
          : Math.round(
              ((rec.filter((v) => v >= 9).length - rec.filter((v) => v <= 6).length) / rec.length) *
                100,
            );
      out.push({
        id,
        name: inst.name,
        department: inst.department,
        responses: list.length,
        overall: pick("overall"),
        knowledge: pick("knowledge"),
        clarity: pick("clarity"),
        engagement: pick("engagement"),
        pace: pick("pace"),
        nps,
      });
    }
    return out;
  }, [responses, instructors, workType, range]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last
      if (bv == null) return -1;
      return dir * (av - bv);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  function exportExcel() {
    const cols = [
      "Instructor",
      "Department",
      "Responses",
      "Overall",
      "Knowledge",
      "Clarity",
      "Engagement",
      "Pace",
      "NPS",
    ];
    const data = sorted.map((r) => ({
      Instructor: r.name,
      Department: r.department ?? "",
      Responses: r.responses,
      Overall: r.overall ?? "",
      Knowledge: r.knowledge ?? "",
      Clarity: r.clarity ?? "",
      Engagement: r.engagement ?? "",
      Pace: r.pace ?? "",
      NPS: r.nps ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: cols });
    ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
    ws["!cols"] = [26, 22, 11, 10, 11, 10, 12, 9, 8].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Instructor Quality");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Instructor Quality.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  const totalResponses = rows.reduce((sum, r) => sum + r.responses, 0);
  const selectCls =
    "border-input bg-background text-foreground focus:ring-ring rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={workType}
            onChange={(e) => {
              setWorkType(e.target.value);
            }}
            className={selectCls}
          >
            {WORK_TYPES.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
            }}
            className={selectCls}
          >
            {DATE_RANGES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">
            {rows.length} instructor{rows.length === 1 ? "" : "s"} · {totalResponses} response
            {totalResponses === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={rows.length === 0}
          className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Export to Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">No survey responses in this view yet.</p>
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-surface border-b">
                <Th
                  label="Instructor"
                  sk="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="left"
                />
                <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                  Dept
                </th>
                <Th
                  label="Responses"
                  sk="responses"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                {TRAIT_COLS.map((t) => (
                  <Th
                    key={t.key}
                    label={t.label}
                    sk={t.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                ))}
                <Th label="NPS" sk="nps" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/instructors/${r.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">{r.department ?? "—"}</td>
                  <td className="text-foreground px-3 py-2 text-right tabular-nums">
                    {r.responses}
                  </td>
                  {TRAIT_COLS.map((t) => (
                    <td key={t.key} className="text-foreground px-3 py-2 text-right tabular-nums">
                      {fmtCell(r[t.key])}
                    </td>
                  ))}
                  <td className="text-foreground px-3 py-2 text-right tabular-nums">
                    {r.nps == null ? "—" : r.nps}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  label,
  sk,
  sortKey,
  sortDir,
  onSort,
  align = "right",
}: {
  label: string;
  sk: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === sk;
  return (
    <th
      className={`px-3 py-2 text-xs font-medium ${align === "left" ? "text-left" : "text-right"}`}
    >
      <button
        type="button"
        onClick={() => {
          onSort(sk);
        }}
        className={`hover:text-foreground inline-flex items-center gap-1 ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
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
          No classes or education deliverables with assigned instructors yet. Assign an instructor
          to one to generate a feedback code.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">
        Generate a QR code for a class or education deliverable. Put it at the end of a session or
        on the deliverable itself (slide, printed card, job aid, or email) — learners scan it, pick
        the instructor, and leave anonymous feedback.
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
