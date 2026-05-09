import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const CURRENT_ORG_COOKIE = "current_org_id";

// React.cache() dedupes within a single request. Layout, page, and
// helpers all call this — without the cache they'd each run the auth
// roundtrip + the org_memberships query, multiplying latency.
export const getCurrentOrgId = cache(async (): Promise<string | null> => {
  const [cookieStore, supabase] = await Promise.all([cookies(), createClient()]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const stored = cookieStore.get(CURRENT_ORG_COOKIE)?.value;

  if (stored) {
    const { data } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("org_id", stored)
      .eq("user_id", user.id)
      .not("accepted_at", "is", null)
      .maybeSingle();
    if (data) return data.org_id;
  }

  // Fall back to most recently accepted membership
  const { data: fallback } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback?.org_id ?? null;
});
