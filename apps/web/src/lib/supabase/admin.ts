import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Admin client — uses the Supabase service role key, bypasses RLS.
// ONLY for server actions where the operation must cross org boundaries
// or initialize state that no regular user can create (e.g. demo seeding).
// Never import this from a client component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — required for admin operations like seeding the demo org. Add it to .env.local (no NEXT_PUBLIC_ prefix).",
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
