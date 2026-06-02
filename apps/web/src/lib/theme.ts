// Shared, dependency-free theme constants — safe to import from both client
// and server (no "server-only"). The actual token values live in globals.css
// under :root (editorial, the default) and [data-theme="bright"].

export const THEMES = ["editorial", "bright"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "editorial";

// Non-httpOnly so the pre-paint inline script and the account switcher can
// read/write it for instant, flash-free theming. The value is non-sensitive.
export const THEME_COOKIE = "arbor_theme";

export const THEME_LABELS: Record<Theme, string> = {
  editorial: "Editorial",
  bright: "Bright",
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function coerceTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
