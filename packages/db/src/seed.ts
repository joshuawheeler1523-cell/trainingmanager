/**
 * Seed script — run with: pnpm db:seed
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
);

async function seed() {
  console.log("Seeding...");
  // TODO: insert seed data
  console.log("Done.");
}

seed().catch(console.error);
