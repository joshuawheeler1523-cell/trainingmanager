"use client";

import { useState } from "react";
import { submitInstructorFeedback, type InstructorRating } from "./actions";

type Instructor = { id: string; name: string };

type Rating = {
  overall: number;
  knowledge: number;
  clarity: number;
  engagement: number;
  pace: number;
  apply: number;
  findability: number;
};

const emptyRating = (): Rating => ({
  overall: 0,
  knowledge: 0,
  clarity: 0,
  engagement: 0,
  pace: 0,
  apply: 0,
  findability: 0,
});

// A live class is rated on the trainer's delivery; a job aid / education
// deliverable is an artifact, so it's rated on clarity, findability, and use.
const CLASS_TRAITS: { key: keyof Rating; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "knowledge", label: "Knowledge & expertise" },
  { key: "clarity", label: "Clear explanations" },
  { key: "engagement", label: "Kept me engaged" },
  { key: "pace", label: "Pace was right" },
  { key: "apply", label: "I can use this in my work" },
];
const AID_TRAITS: { key: keyof Rating; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "clarity", label: "Clear and easy to understand" },
  { key: "findability", label: "I could quickly find what I needed" },
  { key: "apply", label: "Useful — helped me do the task" },
];

// ── Star rating (1–5) ────────────────────────────────────────────────────────
function Stars({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-foreground text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${String(n)} of 5`}
            onClick={() => {
              onChange(value === n ? 0 : n);
            }}
            className={`text-2xl leading-none transition-colors ${
              n <= value ? "text-[#e0922f]" : "text-border hover:text-[#e0922f]/50"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InstructorFeedbackForm({
  token,
  instructors,
  sourceType,
}: {
  token: string;
  instructors: Instructor[];
  sourceType: string;
}) {
  const isClass = sourceType === "class";
  const traits = isClass ? CLASS_TRAITS : AID_TRAITS;

  const [ratings, setRatings] = useState<Record<string, Rating>>(() =>
    Object.fromEntries(instructors.map((i) => [i.id, emptyRating()])),
  );
  const [recommend, setRecommend] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const multi = instructors.length > 1;

  function setField(instructorId: string, field: keyof Rating, value: number) {
    setRatings((prev) => ({
      ...prev,
      [instructorId]: { ...(prev[instructorId] ?? emptyRating()), [field]: value },
    }));
  }

  async function handleSubmit() {
    setError(null);
    const ratingList: InstructorRating[] = instructors
      .map((i) => ({ id: i.id, r: ratings[i.id] ?? emptyRating() }))
      .filter((x) => x.r.overall > 0)
      .map((x) => ({
        instructorId: x.id,
        overall: x.r.overall,
        knowledge: x.r.knowledge,
        clarity: x.r.clarity,
        engagement: x.r.engagement,
        pace: x.r.pace,
        apply: x.r.apply,
        findability: x.r.findability,
      }));

    if (ratingList.length === 0) {
      setError(
        multi
          ? "Please give an overall rating for at least one instructor."
          : "Please give an overall rating.",
      );
      return;
    }

    setSubmitting(true);
    const result = await submitInstructorFeedback(token, {
      recommend,
      comment,
      ratings: ratingList,
    });
    setSubmitting(false);
    if (result.ok) setDone(true);
    else setError(result.error.message);
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <div className="text-4xl">🙏</div>
        <p className="text-foreground mt-3 text-lg font-semibold">Thank you!</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Your feedback helps us improve our training.
        </p>
      </div>
    );
  }

  const inputCls =
    "border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2";

  return (
    <div className="space-y-5">
      {multi && (
        <p className="text-muted-foreground text-sm">
          {isClass
            ? "This session had more than one instructor — please rate each one."
            : "More than one person produced this — please rate each one."}
        </p>
      )}

      {instructors.map((i) => {
        const r = ratings[i.id] ?? emptyRating();
        return (
          <div key={i.id} className="border-border rounded-lg border p-3">
            <p className="text-foreground mb-1 text-sm font-semibold">Rate {i.name}</p>
            {traits.map((t) => (
              <Stars
                key={t.key}
                label={t.label}
                value={r[t.key]}
                onChange={(v) => {
                  setField(i.id, t.key, v);
                }}
              />
            ))}
          </div>
        );
      })}

      {isClass && (
        <div>
          <label className="text-foreground mb-1.5 block text-sm font-medium">
            How likely are you to recommend this training? (0–10)
          </label>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setRecommend(recommend === n ? null : n);
                }}
                className={`h-8 w-8 rounded-md border text-xs font-medium ${
                  recommend === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:bg-surface"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          Anything else? (optional)
        </label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
          }}
          placeholder="What worked well, what could be better…"
          className={inputCls}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={() => {
          void handleSubmit();
        }}
        className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit feedback"}
      </button>
    </div>
  );
}
