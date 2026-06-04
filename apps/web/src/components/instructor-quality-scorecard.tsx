import type { InstructorQuality } from "@/lib/instructor-quality";

const SOURCE_LABEL: Record<string, string> = {
  class: "Classes",
  recurring_task: "Recurring",
  ad_hoc_task: "Ad-hoc",
  education_request: "Education requests",
  project_task: "Projects / sessions",
};

const LEVELS = [
  { n: 1, name: "Reaction" },
  { n: 2, name: "Learning" },
  { n: 3, name: "Behavior" },
  { n: 4, name: "Results" },
] as const;

const STAR = "#e0922f";

function fmt(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(1);
}
function pct(score: number, max: number): string {
  return max === 100 ? `${score.toFixed(0)}%` : `${score.toFixed(0)}/${max.toFixed(0)}`;
}
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Compact SVG sparkline of overall rating (1–5) over months.
function TrendSparkline({ monthly }: { monthly: InstructorQuality["monthly"] }) {
  const pts = monthly.filter((m) => m.overall != null).slice(-12);
  if (pts.length < 2) return null;
  const w = 120;
  const h = 28;
  const xs = (i: number) => (pts.length === 1 ? 0 : (i / (pts.length - 1)) * w);
  const ys = (v: number) => h - ((v - 1) / 4) * h; // 1..5 → bottom..top
  const d = pts
    .map((m, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(m.overall ?? 1).toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={STAR} strokeWidth={1.5} />
      {last && <circle cx={xs(pts.length - 1)} cy={ys(last.overall ?? 1)} r={2} fill={STAR} />}
    </svg>
  );
}

function PeerBadge({ overall, peer }: { overall: number | null; peer: number | null | undefined }) {
  if (overall == null || peer == null) return null;
  const delta = Math.round((overall - peer) * 10) / 10;
  const up = delta >= 0;
  return (
    <span
      className={`text-[11px] font-medium ${up ? "text-success" : "text-warning"}`}
      title={`Department average ${peer.toFixed(1)}`}
    >
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} vs dept
    </span>
  );
}

// The trainer-vs-developer breakdown: quality per deliverable type.
function ByWorkType({ bySource }: { bySource: InstructorQuality["bySource"] }) {
  const rated = bySource.filter((b) => b.overall != null && b.responseCount > 0);
  if (rated.length === 0) return null;
  const sorted = [...rated].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const max = 5;
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-[10px] font-medium uppercase tracking-wide">
        Quality by work type
      </div>
      <div className="space-y-1.5">
        {sorted.map((b) => (
          <div key={b.sourceType} className="flex items-center gap-2">
            <span className="text-foreground w-28 shrink-0 truncate text-xs">
              {SOURCE_LABEL[b.sourceType] ?? b.sourceType}
            </span>
            <div className="bg-surface relative h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(((b.overall ?? 0) / max) * 100).toFixed(0)}%`,
                  backgroundColor: STAR,
                }}
              />
            </div>
            <span className="text-foreground w-14 shrink-0 text-right text-xs tabular-nums">
              {fmt(b.overall)} ★
            </span>
            <span className="text-muted-foreground w-8 shrink-0 text-right text-[10px] tabular-nums">
              {b.responseCount}
            </span>
          </div>
        ))}
      </div>
      {sorted.length >= 2 && (
        <p className="text-muted-foreground mt-2 text-[11px]">
          Strongest:{" "}
          <span className="text-foreground font-medium">
            {SOURCE_LABEL[sorted[0]?.sourceType ?? ""] ?? sorted[0]?.sourceType} (
            {fmt(sorted[0]?.overall)})
          </span>{" "}
          · Needs attention:{" "}
          <span className="text-foreground font-medium">
            {SOURCE_LABEL[sorted[sorted.length - 1]?.sourceType ?? ""] ??
              sorted[sorted.length - 1]?.sourceType}{" "}
            ({fmt(sorted[sorted.length - 1]?.overall)})
          </span>
        </p>
      )}
    </div>
  );
}

// Learning (Kirkpatrick L2): an OBJECTIVE post-test score plus the New World
// Kirkpatrick self-reported leading indicators (confidence then/now + intent).
// Labeled so objective and self-reported are never conflated, and neither is
// presented as a competency or behavior measure.
function LearningSignal({ l1 }: { l1: InstructorQuality["l1"] }) {
  if (!l1) return null;
  const hasQuiz = l1.knowledgeResponses > 0 && l1.knowledgePosttestPct != null;
  const hasConf = l1.confidenceResponses > 0 && l1.confidenceAfter != null;
  const hasIntent = l1.intentResponses > 0 && l1.intent != null;
  if (!hasQuiz && !hasConf && !hasIntent) return null;
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-[10px] font-medium uppercase tracking-wide">
        Learning signal (L2)
      </div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {hasQuiz && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs">Post-test</span>
            <span className="text-foreground text-sm font-medium tabular-nums">
              {(l1.knowledgePosttestPct ?? 0).toFixed(0)}%
            </span>
            <span className="text-success text-[10px] font-medium uppercase">objective</span>
          </span>
        )}
        {hasConf && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs">Confidence to apply</span>
            <span className="text-foreground text-sm font-medium tabular-nums">
              {fmt(l1.confidenceBefore)} → {fmt(l1.confidenceAfter)}
            </span>
            {l1.confidenceGain != null && (
              <span
                className={`text-[11px] font-medium ${
                  l1.confidenceGain >= 0 ? "text-success" : "text-warning"
                }`}
              >
                {l1.confidenceGain >= 0 ? "+" : ""}
                {l1.confidenceGain.toFixed(1)}
              </span>
            )}
          </span>
        )}
        {hasIntent && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs">Intent to apply</span>
            <span className="text-foreground text-sm font-medium tabular-nums">
              {fmt(l1.intent)}/5
            </span>
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-[10px]">
        Post-test is objective; confidence and intent are self-reported leading indicators — not a
        competency or behavior measure.
      </p>
    </div>
  );
}

export default function InstructorQualityScorecard({
  data,
  peerOverall,
  compact = false,
}: {
  data: InstructorQuality;
  peerOverall?: number | null;
  compact?: boolean;
}) {
  const l1 = data.l1;
  const scoresByLevel = (n: number) => data.scores.filter((s) => s.level === n);

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold" style={{ color: STAR }}>
              {l1 && l1.overall != null ? `${l1.overall.toFixed(1)} ★` : "No feedback yet"}
            </span>
            {l1 && l1.responseCount > 0 && (
              <span className="text-muted-foreground text-xs">
                {l1.responseCount} response{l1.responseCount === 1 ? "" : "s"}
                {l1.nps != null ? ` · NPS ${String(l1.nps)}` : ""}
              </span>
            )}
            {l1 && <PeerBadge overall={l1.overall} peer={peerOverall} />}
          </div>
          <TrendSparkline monthly={data.monthly} />
        </div>
        <ByWorkType bySource={data.bySource} />
        <LearningSignal l1={l1} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold" style={{ color: STAR }}>
            {l1 && l1.overall != null ? `${l1.overall.toFixed(1)} ★` : "No feedback yet"}
          </span>
          {l1 && l1.responseCount > 0 && (
            <span className="text-muted-foreground text-xs">
              {l1.responseCount} response{l1.responseCount === 1 ? "" : "s"}
              {l1.nps != null ? ` · NPS ${String(l1.nps)}` : ""}
            </span>
          )}
          {l1 && <PeerBadge overall={l1.overall} peer={peerOverall} />}
        </div>
        <TrendSparkline monthly={data.monthly} />
      </div>

      {/* Kirkpatrick 4 levels */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {LEVELS.map((lvl) => (
          <div key={lvl.n} className="border-border bg-surface rounded-lg border p-3">
            <div className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wide">
              L{lvl.n} · {lvl.name}
            </div>
            {lvl.n === 1 ? (
              l1 && l1.responseCount > 0 ? (
                <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  <span>Know {fmt(l1.knowledge)}</span>
                  <span>Clarity {fmt(l1.clarity)}</span>
                  <span>Engage {fmt(l1.engagement)}</span>
                  <span>Pace {fmt(l1.pace)}</span>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">No learner feedback yet.</p>
              )
            ) : scoresByLevel(lvl.n).length === 0 ? (
              <p className="text-muted-foreground text-xs">Not evaluated.</p>
            ) : (
              <ul className="space-y-1">
                {scoresByLevel(lvl.n).map((s) => (
                  <li key={s.id} className="text-xs">
                    <span className="text-foreground font-medium">
                      {s.metric}: {pct(s.score, s.scoreMax)}
                    </span>
                    {s.periodLabel && (
                      <span className="text-muted-foreground"> · {s.periodLabel}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <ByWorkType bySource={data.bySource} />

      <LearningSignal l1={l1} />

      {data.comments.length > 0 && (
        <div>
          <div className="text-muted-foreground mb-1.5 text-[10px] font-medium uppercase tracking-wide">
            Recent comments
          </div>
          <ul className="space-y-2">
            {data.comments.slice(0, 6).map((c, i) => (
              <li key={i} className="border-border bg-surface rounded-md border p-2.5 text-xs">
                <p className="text-foreground">&ldquo;{c.comment}&rdquo;</p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  {c.overall != null ? `${c.overall.toFixed(0)} ★ · ` : ""}
                  {SOURCE_LABEL[c.sourceType] ?? c.sourceType} · {shortDate(c.submittedAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
