/**
 * Creates the demo admin user and wires them to the seed org.
 * Run after `supabase db reset`: pnpm db:seed
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";

const DEMO_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const DEMO_EMAIL = "admin@mercy-health-demo.example";
const DEMO_PASSWORD = "demo-password-change-me";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("Creating demo admin user…");

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });

  if (createErr && !createErr.message.includes("already been registered")) {
    throw createErr;
  }

  const userId =
    created?.user?.id ??
    (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email === DEMO_EMAIL)?.id;

  if (!userId) throw new Error("Could not resolve demo user id");

  const { error: memberErr } = await supabase
    .from("org_memberships")
    .upsert(
      { org_id: DEMO_ORG_ID, user_id: userId, role: "owner" },
      { onConflict: "org_id,user_id" },
    );

  if (memberErr) throw memberErr;

  console.log(`Done. Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
