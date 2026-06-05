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
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid";
import { generateFeedbackLink, setFeedbackLinkActive } from "./actions";
import { Tabs } from "@/components/ui";

// One anonymous QR survey response (a learner rating one instructor).
export type FeedbackResponse = {
  instructorId: string;
  sourceType: string;
  overall: number | null;
  knowledge: number | null;
  clarity: number | null;
  engagement: number | null;
  pace: number | null;
  apply: number | null;
  findability: number | null;
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
      <Tabs
        tabs={[
          { id: "quality", label: "Quality report" },
          { id: "codes", label: "Feedback codes" },
        ]}
        value={tab}
        onChange={setTab}
        paddingX="px-0"
        className="mb-5"
      />

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

type TraitKey =
  | "overall"
  | "knowledge"
  | "clarity"
  | "engagement"
  | "pace"
  | "apply"
  | "findability";
type SortKey = "name" | "responses" | TraitKey | "nps";

// "Apply" (can I use this) is shared; the rest are deliverable-type-specific and
// show "—" where a given instructor has no responses of that kind.
const TRAIT_COLS: { key: TraitKey; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "apply", label: "Can use" },
  { key: "knowledge", label: "Knowledge" },
  { key: "clarity", label: "Clarity" },
  { key: "engagement", label: "Engagement" },
  { key: "pace", label: "Pace" },
  { key: "findability", label: "Findable" },
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
  apply: number | null;
  findability: number | null;
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
        apply: pick("apply"),
        findability: pick("findability"),
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
      "Can use",
      "Knowledge",
      "Clarity",
      "Engagement",
      "Pace",
      "Findable",
      "NPS",
    ];
    const data = sorted.map((r) => ({
      Instructor: r.name,
      Department: r.department ?? "",
      Responses: r.responses,
      Overall: r.overall ?? "",
      "Can use": r.apply ?? "",
      Knowledge: r.knowledge ?? "",
      Clarity: r.clarity ?? "",
      Engagement: r.engagement ?? "",
      Pace: r.pace ?? "",
      Findable: r.findability ?? "",
      NPS: r.nps ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: cols });
    ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
    ws["!cols"] = [26, 22, 11, 10, 9, 11, 10, 12, 9, 9, 8].map((wch) => ({ wch }));
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
    "border-[var(--hair)] bg-background text-foreground rounded-sm border px-3 py-2 text-sm focus:outline-none focus:border-[var(--forest)] focus:ring-[3px] focus:ring-[rgba(45,74,46,0.12)] transition-[border-color,box-shadow] duration-150";

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
                  Department
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
        {active &&
          (sortDir === "asc" ? (
            <ChevronUpIcon className="h-3 w-3" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}

// ── Feedback codes ───────────────────────────────────────────────────────────

function CodesTab({ deliverables }: { deliverables: DeliverableRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "needs" | "has" | "inactive">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deliverables.filter((d) => {
      if (status === "needs" && d.link) return false;
      if (status === "has" && !(d.link && d.link.isActive)) return false;
      if (status === "inactive" && !(d.link && !d.link.isActive)) return false;
      if (q) {
        const hay = `${d.label} ${d.instructorNames.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deliverables, query, status]);

  const grouped = useMemo(() => {
    const m = new Map<string, DeliverableRow[]>();
    for (const d of filtered) {
      const list = m.get(d.sourceType) ?? [];
      list.push(d);
      m.set(d.sourceType, list);
    }
    return Array.from(m.entries());
  }, [filtered]);

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

  const needsCount = deliverables.filter((d) => !d.link).length;
  const selectCls =
    "border-[var(--hair)] bg-background text-foreground rounded-sm border px-3 py-2 text-sm focus:outline-none focus:border-[var(--forest)] focus:ring-[3px] focus:ring-[rgba(45,74,46,0.12)] transition-[border-color,box-shadow] duration-150";

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Generate a QR code for a class or education deliverable. Put it on the deliverable itself
        (slide, printed card, job aid, or email) — learners scan it, pick the instructor, and leave
        anonymous feedback.
      </p>

      <div className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 py-1">
        <div className="relative min-w-[220px] flex-1">
          <MagnifyingGlassIcon className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Search by name or instructor..."
            className="bg-background text-foreground w-full rounded-sm border border-[var(--hair)] py-2 pl-8 pr-3 text-sm transition-[border-color,box-shadow] duration-150 focus:border-[var(--forest)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(45,74,46,0.12)]"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
          }}
          className={selectCls}
          aria-label="Filter by code status"
        >
          <option value="all">All</option>
          <option value="needs">
            Needs a code{needsCount > 0 ? ` (${String(needsCount)})` : ""}
          </option>
          <option value="has">Has a code</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="text-muted-foreground text-xs">
          {filtered.length} of {deliverables.length}
        </span>
      </div>

      {grouped.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">Nothing matches your search or filter.</p>
        </div>
      ) : (
        grouped.map(([type, rows]) => (
          <section key={type}>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              {SOURCE_LABEL[type] ?? type}{" "}
              <span className="text-muted-foreground font-normal">({rows.length})</span>
            </h3>
            <div className="space-y-2">
              {rows.map((d) => (
                <DeliverableCard key={d.key} row={d} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function DeliverableCard({ row }: { row: DeliverableRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [imgResult, setImgResult] = useState<"" | "copied" | "downloaded">("");
  const [announce, setAnnounce] = useState("");
  const [expanded, setExpanded] = useState(false);

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
  // a Blob promise - Safari requires the value resolve within the user gesture.
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
    say("Clipboard unavailable - saved a PNG to your downloads");
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

  const link = row.link;
  const instructors =
    row.instructorNames.length > 0 ? row.instructorNames.join(", ") : "No instructor";

  return (
    <div className="border-border bg-background rounded-lg border">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">{row.label}</p>
          <p className="text-muted-foreground truncate text-xs">{instructors}</p>
        </div>

        {!link ? (
          <span className="text-muted-foreground shrink-0 text-[11px]">No code</span>
        ) : link.isActive ? (
          <span className="text-success shrink-0 text-[11px] font-medium">Active</span>
        ) : (
          <span className="text-warning shrink-0 text-[11px] font-medium">Inactive</span>
        )}

        {link ? (
          <button
            type="button"
            onClick={() => {
              setExpanded((v) => !v);
            }}
            className="border-border hover:bg-surface flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1"
            title={expanded ? "Hide code & actions" : "Show code & actions"}
            aria-expanded={expanded}
          >
            {link.qr && (
              <Image
                src={link.qr}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-sm"
                unoptimized
              />
            )}
            <ChevronDownIcon
              className={`text-muted-foreground h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={generate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <QrCodeIcon className="h-4 w-4" />
            {pending ? "Generating..." : "Generate code"}
          </button>
        )}
      </div>

      {expanded && link && (
        <div className="border-border flex gap-4 border-t px-3 py-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {link.qr && (
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
            {link.qr && (
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
                  title="Download a vector SVG - stays sharp at any print size"
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
                toggleActive(!link.isActive);
              }}
              className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center px-1 py-1 text-xs"
              title={
                link.isActive
                  ? "Stop collecting feedback for this deliverable"
                  : "Resume collecting feedback"
              }
            >
              {link.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </div>
          {link.qr && (
            <Image
              src={link.qr}
              alt="Feedback QR code"
              width={88}
              height={88}
              className="border-border h-[88px] w-[88px] shrink-0 rounded-md border"
              unoptimized
            />
          )}
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
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
