import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { getExportSignedUrl } from "@/lib/data-export";

export const runtime = "nodejs";

/**
 * Redirects to a 7-day signed Storage URL for the export ZIP. We don't
 * stream the bytes through the app — letting the browser hit Supabase
 * Storage directly avoids tying up the serverless function for the size
 * of the ZIP (which can be 10s of MB for larger tenants).
 *
 * Auth: must be a manager of the org that owns the export.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "no_org" }, { status: 401 });
  if (!(await isManager(orgId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: exp } = await supabase
    .from("data_exports")
    .select("id, org_id, status, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!exp || exp.org_id !== orgId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (exp.status !== "completed" || !exp.storage_path) {
    return NextResponse.json({ error: "not_ready", status: exp.status }, { status: 409 });
  }

  const signedUrl = await getExportSignedUrl(exp.storage_path);
  if (!signedUrl) return NextResponse.json({ error: "url_failed" }, { status: 500 });

  return NextResponse.redirect(signedUrl);
}
