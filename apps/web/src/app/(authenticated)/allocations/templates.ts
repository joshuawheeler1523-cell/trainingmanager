// Allocation bucket templates grounded in industry benchmarks.
//
// Sources:
//   • ATD State of the Industry — typical L&D time allocation patterns
//   • ANCC / nursing professional development specialist scope of practice
//   • AONL workforce planning briefs on hospital education team structure
//   • Common JD breakdowns for "Clinical Nurse Educator" / "Education
//     Coordinator" / "Implementation Educator"
//
// Templates target the FIVE buckets the seed action installs by default:
//   Direct Training · Course Development · Administrative ·
//   Compliance & Audits · PTO / Non-productive
//
// Match against the user's actual bucket names is fuzzy (substring,
// case-insensitive) so renamed buckets like "Direct Instruction" or
// "Admin / Operational" still pick up. If a template category doesn't
// match any of the org's active buckets, that share is dropped and the
// remainder is renormalised to total 100%.

export type BucketTemplate = {
  id: string;
  label: string;
  description: string;
  // Each item is a (bucket-name pattern, percent) pair. Patterns are
  // matched case-insensitively as a substring against bucket names.
  shares: { match: string; percent: number }[];
};

export const BUCKET_TEMPLATES: BucketTemplate[] = [
  {
    id: "balanced",
    label: "Balanced hospital educator",
    description:
      "ATD-aligned baseline for a clinical educator: half on direct teaching, a fifth on course development, the rest split across admin, compliance, and non-productive time.",
    shares: [
      { match: "direct training", percent: 50 },
      { match: "course development", percent: 20 },
      { match: "admin", percent: 15 },
      { match: "compliance", percent: 10 },
      { match: "pto", percent: 5 },
    ],
  },
  {
    id: "implementation",
    label: "Implementation-focused",
    description:
      "Tilted toward course development for teams in the middle of a major rollout (EHR migration, joint replacement program launch, etc.). Less direct delivery while curriculum is being built.",
    shares: [
      { match: "direct training", percent: 30 },
      { match: "course development", percent: 35 },
      { match: "admin", percent: 15 },
      { match: "compliance", percent: 10 },
      { match: "pto", percent: 10 },
    ],
  },
  {
    id: "compliance",
    label: "Compliance-heavy",
    description:
      "For environments preparing for The Joint Commission survey, Magnet redesignation, or other regulatory cycles. A quarter of capacity is committed to audits and required documentation.",
    shares: [
      { match: "direct training", percent: 40 },
      { match: "course development", percent: 15 },
      { match: "admin", percent: 15 },
      { match: "compliance", percent: 25 },
      { match: "pto", percent: 5 },
    ],
  },
  {
    id: "direct-delivery",
    label: "Direct delivery team",
    description:
      "Lean teams whose primary mandate is teaching — bedside skills, simulation, BLS/ACLS cohorts. Course development is light because curriculum is largely off-the-shelf or vendor-supplied.",
    shares: [
      { match: "direct training", percent: 65 },
      { match: "course development", percent: 10 },
      { match: "admin", percent: 10 },
      { match: "compliance", percent: 10 },
      { match: "pto", percent: 5 },
    ],
  },
];

export type AppliedSlate = { bucket_id: string; target_percent: number }[];

/**
 * Map a template onto the user's active buckets. Returns one slate entry
 * per bucket — buckets that don't match anything in the template get 0,
 * matched buckets get the template percent (renormalised to 100% if some
 * categories couldn't be matched).
 */
export function applyTemplateToBuckets(
  template: BucketTemplate,
  buckets: { id: string; name: string }[],
): { slate: AppliedSlate; matched: string[]; unmatchedBucketNames: string[] } {
  const lowerBuckets = buckets.map((b) => ({
    id: b.id,
    name: b.name,
    lower: b.name.toLowerCase(),
  }));

  // Per template share, find the FIRST bucket whose lowercased name contains
  // the pattern. Each bucket can only be claimed once.
  const claimed = new Set<string>();
  const claims: { bucketId: string; percent: number }[] = [];
  const matched: string[] = [];

  for (const share of template.shares) {
    const found = lowerBuckets.find(
      (b) => !claimed.has(b.id) && b.lower.includes(share.match.toLowerCase()),
    );
    if (found) {
      claimed.add(found.id);
      claims.push({ bucketId: found.id, percent: share.percent });
      matched.push(found.name);
    }
  }

  const claimedTotal = claims.reduce((s, c) => s + c.percent, 0);
  // If we missed a category and the total isn't 100, renormalise.
  const factor = claimedTotal > 0 ? 100 / claimedTotal : 0;
  const slate: AppliedSlate = buckets.map((b) => {
    const claim = claims.find((c) => c.bucketId === b.id);
    return {
      bucket_id: b.id,
      target_percent: claim ? Math.round(claim.percent * factor * 10) / 10 : 0,
    };
  });

  // Round drift fix: nudge the last claimed bucket so the total is exactly 100.
  const finalSum = slate.reduce((s, e) => s + e.target_percent, 0);
  const drift = 100 - finalSum;
  const lastClaim = claims.length > 0 ? claims[claims.length - 1] : null;
  if (Math.abs(drift) > 0.01 && lastClaim) {
    const idx = slate.findIndex((e) => e.bucket_id === lastClaim.bucketId);
    const target = idx >= 0 ? slate[idx] : null;
    if (target) {
      target.target_percent = Math.round((target.target_percent + drift) * 10) / 10;
    }
  }

  const unmatchedBucketNames = buckets.filter((b) => !claimed.has(b.id)).map((b) => b.name);

  return { slate, matched, unmatchedBucketNames };
}
