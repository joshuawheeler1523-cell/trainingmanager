"use client";

import { useEffect } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * Reconciles the DOM theme with the user's durable preference (from
 * user_metadata, passed in server-side). The pre-paint script in the root
 * layout already applies the cookie value with no flash; this only kicks in
 * when they differ — e.g. the first authenticated load on a new device, where
 * no cookie exists yet. It then writes the cookie so future loads are instant.
 */
export default function ThemeBoot({ theme }: { theme: Theme }) {
  useEffect(() => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") ?? "editorial";
    if (current === theme) return;
    if (theme === "editorial") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const maxAge = (60 * 60 * 24 * 365).toString();
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${maxAge}; samesite=lax`;
  }, [theme]);
  return null;
}
