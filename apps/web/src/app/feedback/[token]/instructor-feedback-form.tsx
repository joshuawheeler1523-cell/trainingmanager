"use client";

import { useState } from "react";
import { submitInstructorFeedback } from "./actions";

type Instructor = { id: string; name: string };

// ── Star rating (1–5) ────────────────────────────────────────────────────────
function Stars({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-foreground text-sm">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${String(n)} of 5`}
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

// ── 1–5 scale selector ───────────────────────────────────────────────────────
function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${String(n)} of 5`}
            onClick={() => {
              onChange(value === n ? null : n);
            }}
            className={`h-7 w-7 rounded-md border text-xs font-medium ${
              value === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground hover:bg-surface"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InstructorFeedbackForm({
  token,
  instructors,
}: {
  token: string;
  instructors: Instructor[];
}) {
  const [instructorId, setInstructorId] = useState(
    instructors.length === 1 ? (instructors[0]?.id ?? "") : "",
  );
  const [overall, setOverall] = useState(0);
  const [knowledge, setKnowledge] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [engagement, setEngagement] = useState(0);
  const [pace, setPace] = useState(0);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [confidenceBefore, setConfidenceBefore] = useState<number | null>(null);
  const [confidenceAfter, setConfidenceAfter] = useState<number | null>(null);
  const [intent, setIntent] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!instructorId) {
      setError("Please choose the instructor you're rating.");
      return;
    }
    if (!overall) {
      setError("Please give an overall rating.");
      return;
    }
    setSubmitting(true);
    const result = await submitInstructorFeedback(token, {
      instructorId,
      overall,
      knowledge,
      clarity,
      engagement,
      pace,
      recommend,
      confidenceBefore,
      confidenceAfter,
      intent,
      comment,
      respondentName: name,
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
      {instructors.length > 1 && (
        <div>
          <label className="text-foreground mb-1.5 block text-sm font-medium">
            Who are you rating? <span className="text-destructive">*</span>
          </label>
          <div className="space-y-1.5">
            {instructors.map((i) => (
              <label
                key={i.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  instructorId === i.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="instructor"
                  checked={instructorId === i.id}
                  onChange={() => {
                    setInstructorId(i.id);
                  }}
                />
                <span className="text-foreground">{i.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="border-border rounded-lg border p-3">
        <Stars label="Overall" value={overall} onChange={setOverall} required />
        <Stars label="Knowledge & expertise" value={knowledge} onChange={setKnowledge} />
        <Stars label="Clear explanations" value={clarity} onChange={setClarity} />
        <Stars label="Kept me engaged" value={engagement} onChange={setEngagement} />
        <Stars label="Pace was right" value={pace} onChange={setPace} />
      </div>

      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          How likely are you to recommend this instructor? (0–10)
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

      <div className="border-border rounded-lg border p-3">
        <p className="text-foreground mb-1 text-sm font-medium">
          Applying what this covered (optional)
        </p>
        <p className="text-muted-foreground mb-2.5 text-xs">
          &ldquo;I can apply what this covered in my work.&rdquo;
        </p>
        <Scale label="Before today" value={confidenceBefore} onChange={setConfidenceBefore} />
        <Scale label="Now" value={confidenceAfter} onChange={setConfidenceAfter} />
        <div className="border-border mt-2 border-t pt-2">
          <Scale label="I intend to apply what I learned" value={intent} onChange={setIntent} />
        </div>
      </div>

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

      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          Your name (optional)
        </label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Leave blank to stay anonymous"
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
