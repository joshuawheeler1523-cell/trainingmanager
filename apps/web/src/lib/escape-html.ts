/**
 * Escapes a string for interpolation into HTML text or a quoted attribute.
 *
 * Not marked server-only — the print/QR view needs it in the browser too.
 *
 * Single quotes are escaped as well. They only matter inside single-quoted
 * attribute values, but the two previous copies of this function disagreed on
 * that (lib/email.ts escaped them, the instructor-quality print view did not),
 * so this takes the stricter behaviour rather than leaving the weaker one in an
 * HTML-injection position.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
