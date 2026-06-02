"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { THEME_COOKIE, coerceTheme, type Theme } from "@/lib/theme";

/**
 * Keeps <html data-theme> in sync across client navigations.
 *
 * The arbor_theme COOKIE is authoritative — it reflects the user's most recent
 * explicit choice (set by the switcher) and is what the pre-paint script in the
 * root layout applies with no flash. This component:
 *   • re-asserts the cookie's theme on every navigation, so a layout
 *     re-render/revalidation that drops the attribute is restored; and
 *   • seeds the cookie + DOM from the durable per-user preference (user_metadata,
 *     passed as `theme`) ONLY when there's no cookie yet — i.e. the first
 *     authenticated load on a new device.
 *
 * Deliberately NOT making `theme` (metadata) win: getUser() can return a stale
 * metadata value right after a toggle, and letting it override the cookie would
 * revert the user's just-made choice (e.g. after adding a department).
 */
export default function ThemeBoot({ theme }: { theme: Theme }) {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const match = /(?:^|; )arbor_theme=([^;]+)/.exec(document.cookie);
    const hasCookie = match !== null;
    const desired: Theme = hasCookie ? coerceTheme(decodeURIComponent(match[1] ?? "")) : theme;

    const current = root.getAttribute("data-theme") ?? "editorial";
    if (current !== desired) {
      if (desired === "editorial") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", desired);
    }
    if (!hasCookie) {
      const maxAge = (60 * 60 * 24 * 365).toString();
      document.cookie = `${THEME_COOKIE}=${desired}; path=/; max-age=${maxAge}; samesite=lax`;
    }
  }, [theme, pathname]);
  return null;
}
