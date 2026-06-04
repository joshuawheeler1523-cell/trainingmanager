"use client";

import Link from "next/link";
import { useMemo } from "react";
import * as XLSX from "xlsx";
import { ArrowLeftIcon, PrinterIcon, ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import type { ClassWithHours } from "@arbor/shared";

type Bucket = { id: string; name: string; color: string };

type SkillReq = {
  skill_name: string;
  skill_category: string | null;
  min_proficiency: string;
  requirement: string;
  is_certification: boolean;
  certifying_authority: string | null;
};

type Props = {
  orgName: string;
  classes: ClassWithHours[];
  bucketById: Record<string, Bucket>;
  requirementsByClass: Record<string, SkillReq[]>;
};

// University-quality course catalog. Server data → print-friendly HTML.
// User clicks "Save as PDF" → triggers window.print() → browser print
// dialog with the page already laid out for letter-sized paper.
//
// CSS strategy:
//   - Screen view: centered "page" cards on a muted background so the
//     planner can scroll-preview before printing.
//   - Print view: each <section.page> page-breaks, no chrome, page
//     numbers in footer via CSS counters.
//   - All styles inlined via <style jsx global> so we don't need to
//     wire Tailwind print variants for every rule.

export default function CatalogClient({
  orgName,
  classes,
  bucketById,
  requirementsByClass,
}: Props) {
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = new Date().getFullYear();

  // Flat, filterable Excel export — one row per class with AutoFilter pre-enabled
  // so it opens already sortable/searchable (the "find what I need fast" job the
  // PDF brochure can't do).
  function exportExcel() {
    const columns = [
      "Category",
      "Course",
      "Description",
      "Target audience",
      "Prerequisites",
      "Required skills / certs",
      "Format",
      "Offerings / yr",
      "Hours per offering",
      "Annual hours",
    ];
    const rows = classes
      .map((c) => {
        const category = bucketById[c.allocation_bucket_id ?? ""]?.name ?? "Uncategorized";
        const reqs = (requirementsByClass[c.id] ?? []).map((r) =>
          r.is_certification ? `${r.skill_name} (cert)` : r.skill_name,
        );
        return {
          Category: category,
          Course: c.name,
          Description: c.description ?? "",
          "Target audience": c.target_audience ?? "",
          Prerequisites: c.prerequisites ?? "",
          "Required skills / certs": reqs.join("; "),
          Format: c.is_multi_day ? `Multi-day (${String(c.total_days)} days)` : "Single day",
          "Offerings / yr": c.offerings_per_year,
          "Hours per offering": c.total_hours_per_offering ?? "",
          "Annual hours": c.annual_class_hours ?? "",
        };
      })
      .sort((a, b) => a.Category.localeCompare(b.Category) || a.Course.localeCompare(b.Course));

    const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
    ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
    ws["!cols"] = [22, 34, 44, 28, 26, 30, 18, 13, 16, 13].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Course Catalog");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${orgName.replace(/[^\w -]/g, "").trim() || "Course"} Course Catalog.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // Group classes by bucket (or "Uncategorized") for the TOC.
  const grouped = useMemo(() => {
    const byBucket = new Map<string, ClassWithHours[]>();
    for (const c of classes) {
      const key = c.allocation_bucket_id ?? "__uncategorized__";
      const list = byBucket.get(key) ?? [];
      list.push(c);
      byBucket.set(key, list);
    }
    // Stable group order: bucket name asc, uncategorized last.
    const entries = [...byBucket.entries()].sort((a, b) => {
      if (a[0] === "__uncategorized__") return 1;
      if (b[0] === "__uncategorized__") return -1;
      const an = bucketById[a[0]]?.name ?? "";
      const bn = bucketById[b[0]]?.name ?? "";
      return an.localeCompare(bn);
    });
    return entries.map(([bucketId, items]) => ({
      bucketId,
      bucketName:
        bucketId === "__uncategorized__"
          ? "Uncategorized"
          : (bucketById[bucketId]?.name ?? "Uncategorized"),
      bucketColor:
        bucketId === "__uncategorized__" ? "#94a3b8" : (bucketById[bucketId]?.color ?? "#94a3b8"),
      items: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [classes, bucketById]);

  return (
    <>
      <CatalogStyles />

      {/* Screen-only toolbar: hidden in print via .no-print class. */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <Link
          href="/classes"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Classes
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export to Excel
          </button>
          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <PrinterIcon className="h-4 w-4" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="catalog">
        {/* ───────────────────────── COVER PAGE ───────────────────────── */}
        <section className="page page-cover">
          <div className="cover-accent" />
          <div className="cover-eyebrow">{year.toString()}</div>
          <h1 className="cover-title">{orgName}</h1>
          <div className="cover-divider" />
          <p className="cover-subtitle">Course Catalog</p>
          <div className="cover-footer">
            <p>
              {classes.length.toString()} courses · {grouped.length.toString()}{" "}
              {grouped.length === 1 ? "category" : "categories"}
            </p>
            <p>Published {today}</p>
          </div>
        </section>

        {/* ───────────────────────── TABLE OF CONTENTS ───────────────────────── */}
        <section className="page page-toc">
          <h2 className="toc-heading">Contents</h2>
          {grouped.map((g) => (
            <div key={g.bucketId} className="toc-group">
              <h3 className="toc-group-heading">
                <span className="toc-swatch" style={{ background: g.bucketColor }} />
                {g.bucketName}
              </h3>
              <ul className="toc-list">
                {g.items.map((c) => (
                  <li key={c.id} className="toc-item">
                    <span className="toc-item-name">{c.name}</span>
                    <span className="toc-item-dots" aria-hidden="true" />
                    <span className="toc-item-hours">
                      {c.total_hours_per_offering != null
                        ? `${formatHours(c.total_hours_per_offering)} h`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* ───────────────────────── COURSE PAGES ───────────────────────── */}
        {grouped.map((g) =>
          g.items.map((c) => {
            const reqs = requirementsByClass[c.id] ?? [];
            return (
              <section key={c.id} className="page page-course">
                <header className="course-header">
                  <div className="course-category" style={{ borderLeftColor: g.bucketColor }}>
                    {g.bucketName}
                  </div>
                  <h2 className="course-title">{c.name}</h2>
                  {c.description && <p className="course-lead">{c.description}</p>}
                  {c.target_audience && (
                    <p className="course-lead" style={{ marginTop: 4 }}>
                      <strong>Audience:</strong> {c.target_audience}
                    </p>
                  )}
                  {c.prerequisites && (
                    <p className="course-lead" style={{ marginTop: 4 }}>
                      <strong>Prerequisites:</strong> {c.prerequisites}
                    </p>
                  )}
                </header>

                <div className="course-spec-grid">
                  <SpecItem
                    label="Duration"
                    value={formatDuration(c)}
                    hint={
                      c.total_hours_per_offering != null
                        ? `${formatHours(c.total_hours_per_offering)} hours total`
                        : null
                    }
                  />
                  <SpecItem
                    label="Format"
                    value={c.is_multi_day ? "Multi-day course" : "Single session"}
                    hint={
                      c.is_multi_day && c.custom_day_hours && c.custom_day_hours.length > 0
                        ? c.custom_day_hours
                            .map((h, i) => `Day ${(i + 1).toString()}: ${formatHours(h)}h`)
                            .join(" · ")
                        : null
                    }
                  />
                  <SpecItem
                    label="Frequency"
                    value={
                      c.offerings_per_year > 0
                        ? `${c.offerings_per_year.toString()} × per year`
                        : "On demand"
                    }
                    hint={
                      c.annual_class_hours != null
                        ? `${formatHours(c.annual_class_hours)} hours annually`
                        : null
                    }
                  />
                  <SpecItem
                    label="Instructor time per offering"
                    value={
                      c.total_hours_per_offering != null
                        ? `${formatHours(c.total_hours_per_offering)} h`
                        : "—"
                    }
                    hint={
                      c.prep_hours_per_offering > 0 || c.logistics_hours_per_offering > 0
                        ? [
                            c.prep_hours_per_offering > 0
                              ? `${formatHours(c.prep_hours_per_offering)}h prep`
                              : null,
                            c.logistics_hours_per_offering > 0
                              ? `${formatHours(c.logistics_hours_per_offering)}h logistics`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" + ")
                        : null
                    }
                  />
                </div>

                {reqs.length > 0 && (
                  <div className="course-section">
                    <h3 className="course-section-heading">Prerequisites</h3>
                    <ul className="course-req-list">
                      {reqs.map((r, i) => (
                        <li key={i} className="course-req">
                          <div className="course-req-name">
                            {r.skill_name}
                            {r.requirement === "preferred" && (
                              <span className="course-req-tag">preferred</span>
                            )}
                            {r.is_certification && (
                              <span className="course-req-tag course-req-tag-cert">
                                certification
                              </span>
                            )}
                          </div>
                          <div className="course-req-meta">
                            {r.skill_category && <span>{r.skill_category}</span>}
                            <span>Min. proficiency: {capitalize(r.min_proficiency)}</span>
                            {r.certifying_authority && <span>{r.certifying_authority}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          }),
        )}

        {/* ───────────────────────── BACK MATTER ───────────────────────── */}
        <section className="page page-back">
          <h2 className="back-heading">About this catalog</h2>
          <p className="back-body">
            This catalog lists every active course offered by <strong>{orgName}</strong> as of{" "}
            {today}. Course details are subject to revision; for the most current information, or to
            inquire about scheduling and prerequisites, please contact the training department.
          </p>
          <p className="back-body back-body-muted">
            Generated by Arbor — capacity and training-resource management for healthcare
            implementations.
          </p>
        </section>
      </div>
    </>
  );
}

function SpecItem({ label, value, hint }: { label: string; value: string; hint: string | null }) {
  return (
    <div className="course-spec">
      <div className="course-spec-label">{label}</div>
      <div className="course-spec-value">{value}</div>
      {hint && <div className="course-spec-hint">{hint}</div>}
    </div>
  );
}

function formatHours(n: number): string {
  // 8 → "8", 7.5 → "7.5"
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? r.toString() : r.toFixed(1);
}

function formatDuration(c: ClassWithHours): string {
  if (c.is_multi_day && c.total_days > 1) {
    return `${c.total_days.toString()} days`;
  }
  if (c.hours_per_day != null && c.hours_per_day > 0) {
    return `${formatHours(c.hours_per_day)} hours`;
  }
  return "—";
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CATALOG_CSS = `
      /* Reset background for the catalog page only */
      body {
        background: #f1f5f9;
      }

      .catalog {
        font-family: "Georgia", "Iowan Old Style", "Apple Garamond", "Baskerville",
          "Times New Roman", serif;
        color: #0f172a;
        max-width: none;
      }

      /* Each .page is a US Letter page when printed; on screen they sit
         centered on a muted background as preview cards. */
      .page {
        background: #ffffff;
        width: 8.5in;
        min-height: 11in;
        margin: 0.5in auto;
        padding: 0.75in 0.85in;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
        page-break-after: always;
        box-sizing: border-box;
        position: relative;
        counter-increment: catalog-page;
      }

      /* ── Cover ── */
      .page-cover {
        padding: 1.5in 1in 1in;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        background:
          linear-gradient(135deg, rgba(15, 23, 42, 0.03) 0%, rgba(15, 23, 42, 0) 60%) center / cover,
          #ffffff;
      }
      .cover-accent {
        position: absolute;
        top: 0.85in;
        left: 0.85in;
        width: 1.5in;
        height: 4px;
        background: #0f172a;
      }
      .cover-eyebrow {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 11pt;
        letter-spacing: 0.3em;
        color: #64748b;
        text-transform: uppercase;
        margin: 1.5in 0 0.5in;
      }
      .cover-title {
        font-size: 42pt;
        line-height: 1.05;
        font-weight: 700;
        letter-spacing: -0.01em;
        margin: 0;
        max-width: 6.5in;
      }
      .cover-divider {
        height: 1px;
        width: 100%;
        background: #cbd5e1;
        margin: 0.7in 0;
      }
      .cover-subtitle {
        font-size: 24pt;
        line-height: 1.1;
        margin: 0;
        color: #1e293b;
        font-style: italic;
      }
      .cover-footer {
        margin-top: auto;
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 10pt;
        color: #64748b;
        line-height: 1.5;
      }

      /* ── TOC ── */
      .toc-heading {
        font-size: 28pt;
        font-weight: 700;
        margin: 0 0 0.4in;
        letter-spacing: -0.01em;
      }
      .toc-group {
        margin-bottom: 0.35in;
        page-break-inside: avoid;
      }
      .toc-group-heading {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 10pt;
        font-weight: 600;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        margin: 0 0 0.12in;
        display: flex;
        align-items: center;
        gap: 0.12in;
      }
      .toc-swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        display: inline-block;
      }
      .toc-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .toc-item {
        display: flex;
        align-items: baseline;
        gap: 0.1in;
        padding: 4pt 0;
        border-bottom: 1px dotted #e2e8f0;
        font-size: 11pt;
      }
      .toc-item-name {
        flex: 0 1 auto;
      }
      .toc-item-dots {
        flex: 1 1 auto;
      }
      .toc-item-hours {
        flex: 0 0 auto;
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 10pt;
        color: #64748b;
        font-variant-numeric: tabular-nums;
      }

      /* ── Course page ── */
      .course-header {
        margin-bottom: 0.45in;
      }
      .course-category {
        display: inline-block;
        padding: 0 0 0 10pt;
        border-left: 3px solid #0f172a;
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 9pt;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: #475569;
        margin-bottom: 0.18in;
      }
      .course-title {
        font-size: 28pt;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.015em;
        margin: 0 0 0.18in;
      }
      .course-lead {
        font-size: 13pt;
        line-height: 1.55;
        color: #1e293b;
        margin: 0;
      }

      .course-spec-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25in 0.4in;
        padding: 0.25in 0;
        border-top: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 0.4in;
      }
      .course-spec-label {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 8.5pt;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #64748b;
        margin-bottom: 4pt;
      }
      .course-spec-value {
        font-size: 14pt;
        font-weight: 600;
        line-height: 1.2;
        margin-bottom: 3pt;
      }
      .course-spec-hint {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 9.5pt;
        color: #64748b;
        line-height: 1.4;
      }

      .course-section {
        margin-bottom: 0.35in;
      }
      .course-section-heading {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 10pt;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #475569;
        margin: 0 0 0.15in;
      }
      .course-req-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .course-req {
        padding: 0.12in 0;
        border-bottom: 1px solid #f1f5f9;
      }
      .course-req:last-child {
        border-bottom: none;
      }
      .course-req-name {
        font-size: 12pt;
        font-weight: 600;
        line-height: 1.3;
        display: flex;
        align-items: center;
        gap: 0.1in;
        flex-wrap: wrap;
      }
      .course-req-tag {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 8pt;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 2pt 6pt;
        border-radius: 2pt;
        background: #f1f5f9;
        color: #475569;
      }
      .course-req-tag-cert {
        background: #0f172a;
        color: #ffffff;
      }
      .course-req-meta {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 9.5pt;
        color: #64748b;
        line-height: 1.5;
        margin-top: 3pt;
        display: flex;
        gap: 0.2in;
        flex-wrap: wrap;
      }

      /* ── Back matter ── */
      .back-heading {
        font-size: 22pt;
        font-weight: 700;
        margin: 0 0 0.25in;
        letter-spacing: -0.01em;
      }
      .back-body {
        font-size: 11.5pt;
        line-height: 1.6;
        margin: 0 0 0.2in;
        max-width: 5.5in;
      }
      .back-body-muted {
        color: #64748b;
        font-size: 10pt;
      }

      /* ── Print ── */
      @media print {
        @page {
          size: letter;
          margin: 0;
        }
        body {
          background: #ffffff;
        }
        .no-print {
          display: none !important;
        }
        .page {
          margin: 0;
          box-shadow: none;
          page-break-after: always;
        }
        /* Avoid widow/orphan splits inside grouped blocks */
        .course-spec-grid,
        .course-req,
        .toc-group {
          page-break-inside: avoid;
        }
      }
`;

function CatalogStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CATALOG_CSS }} />;
}
