#!/usr/bin/env node
/**
 * Provisions E2E test users idempotently.
 *
 * Creates (or finds) two auth users:
 *   • e2e-instructor@arbor.local (role: instructor, linked to instructors row)
 *   • e2e-viewer@arbor.local     (role: viewer)
 *
 * Both join the Mercy Health (Demo) org by default. Override with
 * SEED_E2E_ORG_ID env var.
 *
 * Run:
 *   pnpm seed:e2e-users
 *
 * Required env (typically in apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * After running, add these to apps/web/.env.local manually so playwright
 * picks them up (the script prints the values to copy):
 *   E2E_INSTRUCTOR_EMAIL=e2e-instructor@arbor.local
 *   E2E_INSTRUCTOR_PASSWORD=<value>
 *   E2E_VIEWER_EMAIL=e2e-viewer@arbor.local
 *   E2E_VIEWER_PASSWORD=<value>
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(APP_DIR, "../..");

// ── Load .env.local from apps/web so we don't need to set env globally ─────

function loadDotEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (key && !process.env[key]) {
        process.env[key] = value?.replace(/^["']|["']$/g, "") ?? "";
      }
    }
  } catch {
    // ok if missing
  }
}

loadDotEnv(join(APP_DIR, ".env.local"));
loadDotEnv(join(REPO_ROOT, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.env.SEED_E2E_ORG_ID ?? "a0000000-0000-0000-0000-000000000001";

if (!url || !serviceRole) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to apps/web/.env.local.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORDS = {
  instructor:
    process.env.E2E_INSTRUCTOR_PASSWORD ??
    `e2e-instructor-${Math.random().toString(36).slice(2, 10)}`,
  viewer:
    process.env.E2E_VIEWER_PASSWORD ?? `e2e-viewer-${Math.random().toString(36).slice(2, 10)}`,
};

interface UserSpec {
  email: string;
  role: "instructor" | "viewer";
  password: string;
}

const SPECS: UserSpec[] = [
  { email: "e2e-instructor@arbor.local", role: "instructor", password: PASSWORDS.instructor },
  { email: "e2e-viewer@arbor.local", role: "viewer", password: PASSWORDS.viewer },
];

async function findOrCreateUser(spec: UserSpec): Promise<string> {
  // List + filter (the auth admin API doesn't have getByEmail).
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === spec.email.toLowerCase());
  if (existing) {
    // Reset password to the generated one so the test fixture can log in.
    await admin.auth.admin.updateUserById(existing.id, { password: spec.password });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${spec.email}: ${error.message}`);
  return data.user.id;
}

async function ensureMembership(userId: string, role: string): Promise<void> {
  const { data: existing } = await admin
    .from("org_memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.role !== role) {
      await admin.from("org_memberships").update({ role }).eq("id", existing.id);
    }
    return;
  }

  const { error } = await admin.from("org_memberships").insert({
    org_id: orgId,
    user_id: userId,
    role,
    accepted_at: new Date().toISOString(),
  });
  if (error) throw new Error(`org_memberships insert: ${error.message}`);
}

async function ensureDepartmentMembership(userId: string): Promise<void> {
  // Find first department in org.
  const { data: dept } = await admin
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!dept) return;
  const { data: existing } = await admin
    .from("department_memberships")
    .select("id")
    .eq("department_id", dept.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;
  await admin.from("department_memberships").insert({
    department_id: dept.id,
    user_id: userId,
    role: "member",
    accepted_at: new Date().toISOString(),
  });
}

async function ensureInstructorRow(userId: string, email: string): Promise<void> {
  // If an instructor row matching email already exists in the org, link it;
  // otherwise create one.
  const { data: existing } = await admin
    .from("instructors")
    .select("id, user_id")
    .eq("org_id", orgId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (existing.user_id !== userId) {
      await admin.from("instructors").update({ user_id: userId }).eq("id", existing.id);
    }
    return;
  }

  const { data: dept } = await admin
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!dept) {
    console.warn("No department in org; skipping instructor row creation.");
    return;
  }

  await admin.from("instructors").insert({
    org_id: orgId,
    department_id: dept.id,
    user_id: userId,
    full_name: "E2E Instructor",
    email,
    annual_hours: 1880,
    status: "active",
  });
}

async function main() {
  console.log(`Seeding E2E test users into org ${orgId}…\n`);

  const results: { email: string; role: string; password: string }[] = [];

  for (const spec of SPECS) {
    const userId = await findOrCreateUser(spec);
    await ensureMembership(userId, spec.role);
    await ensureDepartmentMembership(userId);
    if (spec.role === "instructor") {
      await ensureInstructorRow(userId, spec.email);
    }
    console.log(`  ✓ ${spec.email}  →  ${spec.role}  (${userId})`);
    results.push({ email: spec.email, role: spec.role, password: spec.password });
  }

  console.log("\nAdd these to apps/web/.env.local (the playwright fixture reads them):\n");
  for (const r of results) {
    const prefix = r.role === "instructor" ? "E2E_INSTRUCTOR" : "E2E_VIEWER";
    console.log(`${prefix}_EMAIL=${r.email}`);
    console.log(`${prefix}_PASSWORD=${r.password}`);
  }
  console.log("\nThen unskip the test.describe.skip blocks in apps/web/e2e/three-roles.spec.ts.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
