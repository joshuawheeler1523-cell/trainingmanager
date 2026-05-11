import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Arbor super-admin gate. Anyone whose auth.users.id is listed in the
 * comma-separated ARBOR_ADMIN_USER_IDS env var can access /arbor/*.
 *
 * Single role for v1 — full access to every cross-platform surface.
 * Splitting into arbor_admin (write) + arbor_support (read-only) is a
 * future refinement.
 *
 * Cached per-request via React.cache so the layout + page + child
 * components share one auth lookup.
 */
export const isArborAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const list = (process.env["ARBOR_ADMIN_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(user.id);
});

/** Throws if the caller isn't an Arbor admin. Use in server actions. */
export async function requireArborAdmin(): Promise<void> {
  if (!(await isArborAdmin())) {
    throw new Error("Forbidden: Arbor admin only");
  }
}
