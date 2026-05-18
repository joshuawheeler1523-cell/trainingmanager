"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { publicSubmitSchema } from "@arbor/shared";
import type { Database } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

// The submission goes through the anon role (no logged-in user). The RLS
// policy `education_requests_insert_public_anon` validates the token + status
// + submitted_via combination, so this action just needs to wire the values
// up correctly and let the database reject anything that doesn't match.

export async function submitPublicRequest(
  token: string,
  input: unknown,
): Promise<ActionResult<{ tracking_id: string }>> {
  const parsed = publicSubmitSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const field = first?.path.join(".");
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: first?.message ?? "Invalid input",
        ...(field ? { field } : {}),
      },
    };
  }

  // Fresh anon client (no cookies). We deliberately don't use the cookie-
  // based server client because this endpoint must work for unauthenticated
  // visitors.
  const anonClient = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Resolve token → org_id (also confirms the token is active+unexpired
  // because the anon SELECT policy filters those out).
  const { data: link, error: linkErr } = await anonClient
    .from("public_intake_links")
    .select("token, org_id")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) return { ok: false, error: { code: linkErr.code, message: linkErr.message } };
  if (!link) {
    return {
      ok: false,
      error: {
        code: "INVALID_TOKEN",
        message: "This intake link is no longer active.",
      },
    };
  }

  // Anon submissions land in the org's "general" department by default.
  const { data: dept } = await anonClient
    .from("departments")
    .select("id")
    .eq("org_id", link.org_id)
    .eq("slug", "general")
    .maybeSingle();
  const departmentId = dept?.id;
  if (!departmentId) {
    return {
      ok: false,
      error: { code: "NO_DEPARTMENT", message: "Org has no default department" },
    };
  }

  // Public submitters can't pick a bucket. Resolve the org's default
  // through a token-gated SECURITY DEFINER RPC so the anon client never
  // needs SELECT on allocation_buckets directly.
  const { data: defaultBucketId, error: bucketErr } = await anonClient.rpc(
    "public_intake_default_bucket",
    { p_token: token },
  );
  if (bucketErr) {
    return { ok: false, error: { code: bucketErr.code, message: bucketErr.message } };
  }
  if (!defaultBucketId) {
    return {
      ok: false,
      error: {
        code: "NO_BUCKET",
        message: "This org has no allocation buckets configured. Ask an admin to create one.",
      },
    };
  }

  const { data, error } = await anonClient
    .from("education_requests")
    .insert({
      org_id: link.org_id,
      department_id: departmentId,
      bucket_id: defaultBucketId,
      title: parsed.data.title,
      requested_by_name: parsed.data.requested_by_name,
      requested_by_email: parsed.data.requested_by_email,
      requested_by_department: parsed.data.requested_by_department,
      business_justification: parsed.data.business_justification,
      target_audience: parsed.data.target_audience,
      urgency: parsed.data.urgency,
      target_completion_date: parsed.data.target_completion_date,
      submitted_via: "public_form",
      public_form_token: link.token,
      status: "new",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  return { ok: true, data: { tracking_id: data.id } };
}
