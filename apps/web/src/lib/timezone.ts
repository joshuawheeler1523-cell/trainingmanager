/**
 * Tiny helpers that let a date-time picker / calendar render dates in a
 * specific IANA timezone (e.g. the org's `time_zone`), independent of the
 * browser's local timezone.
 *
 * The trick: react-big-calendar (and most pickers) assume the Date object
 * is in the browser's local time. To force a different display tz, we build
 * a "fake-local" Date whose getHours/getMinutes/... match what the wall
 * clock would read in the target tz, then accept that the underlying
 * epoch is wrong — but the picker only cares about the wall-clock fields.
 *
 * Round-trip:
 *   utc → toCalendarLocal(iso, "America/New_York") → fake-local Date
 *   fake-local Date → fromCalendarLocal(date, "America/New_York") → utc iso
 *
 * Don't pass the fake-local Date to anything that cares about the epoch
 * (e.g., Date.now() comparisons, server-bound API calls). Convert back via
 * fromCalendarLocal first.
 */

const isoFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = isoFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    isoFormatterCache.set(tz, f);
  }
  return f;
}

/**
 * Take a real UTC date (or ISO string) and produce a "fake local" Date that,
 * when rendered as if in the browser's local timezone, shows the same wall
 * clock as `tz`.
 */
export function toCalendarLocal(input: string | Date, tz: string): Date {
  const real = typeof input === "string" ? new Date(input) : input;
  const parts = partsFormatter(tz).formatToParts(real);
  const lookup: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") lookup[p.type] = p.value;
  // "hour" can be "24" for midnight in some locales; clamp to 0.
  const hour = lookup.hour === "24" ? "00" : (lookup.hour ?? "00");
  return new Date(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(hour),
    Number(lookup.minute ?? "0"),
    Number(lookup.second ?? "0"),
  );
}

/**
 * Inverse of toCalendarLocal: take a Date whose local-timezone fields
 * represent a wall clock in `tz`, and return the real ISO UTC string.
 *
 * Iterates twice (once with an estimated offset, once with the true offset
 * for the target instant) to handle DST transitions correctly.
 */
export function fromCalendarLocal(fakeLocal: Date, tz: string): string {
  const wall = {
    year: fakeLocal.getFullYear(),
    month: fakeLocal.getMonth(),
    day: fakeLocal.getDate(),
    hour: fakeLocal.getHours(),
    minute: fakeLocal.getMinutes(),
    second: fakeLocal.getSeconds(),
  };
  const wallMillis = Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second);
  let guess = wallMillis;
  // Two passes: the first computes the tz offset for the initial guess; the
  // second refines if the guess straddled a DST transition. drift is measured
  // against the fixed wallMillis target, NOT the moving guess — otherwise the
  // loop re-applies the full offset on iteration 2 and drifts by one offset
  // per pass (4h for EDT, 5h for EST, etc.). This was the source of the
  // post-#19 "moved sessions land N hours late" bug.
  for (let i = 0; i < 2; i++) {
    const parts = partsFormatter(tz).formatToParts(new Date(guess));
    const got: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") got[p.type] = p.value;
    const gotMillis = Date.UTC(
      Number(got.year),
      Number(got.month) - 1,
      Number(got.day),
      Number(got.hour === "24" ? "00" : (got.hour ?? "00")),
      Number(got.minute ?? "0"),
      Number(got.second ?? "0"),
    );
    const drift = gotMillis - wallMillis;
    guess -= drift;
  }
  return new Date(guess).toISOString();
}
