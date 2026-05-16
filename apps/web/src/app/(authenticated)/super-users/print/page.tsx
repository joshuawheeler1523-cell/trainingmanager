import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import PrintClient from "./print-client";

export const metadata = {
  title: "Super users — print",
  robots: { index: false, follow: false },
};

export default async function SuperUsersPrintPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: org }, { data: rows }] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
    supabase
      .from("super_users")
      .select("*, classes ( id, name )")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  type Row = {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    unit: string | null;
    class_id: string | null;
    topic: string | null;
    trained_at: string | null;
    classes: { id: string; name: string } | null;
  };

  const list = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    phone: r.phone,
    unit: r.unit,
    class_id: r.class_id,
    topic: r.topic,
    trained_at: r.trained_at,
    class_name: r.classes?.name ?? null,
  }));

  return <PrintClient orgName={org?.name ?? "Organization"} rows={list} />;
}
