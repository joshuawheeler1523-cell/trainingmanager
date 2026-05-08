"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { TICKET_CATEGORY_VALUES, TICKET_PRIORITY_VALUES, TICKET_STATUS_VALUES } from "./constants";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

function validationError(err: {
  errors: Array<{ message: string; path: (string | number)[] }>;
}): ActionResult<never> {
  const first = err.errors[0];
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

async function ctx() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      error: { code: "UNAUTHENTICATED", message: "Sign in required" },
    };
  }
  return { ok: true as const, supabase, orgId, userId: user.id };
}

// ── tickets ────────────────────────────────────────────────────────────────

const ticketInsertSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  description: z.string().min(1, "Description is required").max(10_000),
  category: z.enum(TICKET_CATEGORY_VALUES).default("how_to"),
  priority: z.enum(TICKET_PRIORITY_VALUES).default("medium"),
});

export async function createTicket(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = ticketInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("support_tickets")
    .insert({
      org_id: c.orgId,
      user_id: c.userId,
      subject: parsed.data.subject,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/account/tickets");
  return { ok: true, data: { id: data.id } };
}

const replySchema = z.object({
  body: z.string().min(1, "Reply can't be empty").max(10_000),
  // 'user' or 'admin' — the caller's role on the ticket. The DB policy
  // enforces that only the matching identity can post.
  authorKind: z.enum(["user", "admin"]),
});

export async function replyToTicket(
  ticketId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("support_ticket_messages")
    .insert({
      org_id: c.orgId,
      ticket_id: ticketId,
      author_kind: parsed.data.authorKind,
      author_id: c.userId,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  // Clear the unread flag for the side that just posted (so the badge doesn't
  // hang on their own reply).
  const flag =
    parsed.data.authorKind === "user" ? { unread_for_user: false } : { unread_for_admin: false };
  await c.supabase.from("support_tickets").update(flag).eq("id", ticketId);

  revalidatePath("/account/tickets");
  revalidatePath(`/account/tickets/${ticketId}`);
  return { ok: true, data: { id: data.id } };
}

const statusSchema = z.object({ status: z.enum(TICKET_STATUS_VALUES) });

export async function setTicketStatus(
  ticketId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("support_tickets")
    .update({ status: parsed.data.status })
    .eq("id", ticketId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/account/tickets");
  revalidatePath(`/account/tickets/${ticketId}`);
  return { ok: true, data: { id: ticketId } };
}

// Mark the unread flag false for the current viewer's side. Called when the
// thread page mounts so the badge clears after the user opens it.
export async function markTicketReadForViewer(
  ticketId: string,
  viewerSide: "user" | "admin",
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const flag = viewerSide === "user" ? { unread_for_user: false } : { unread_for_admin: false };
  const { error } = await c.supabase.from("support_tickets").update(flag).eq("id", ticketId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: true, data: { id: ticketId } };
}

// ── notifications ──────────────────────────────────────────────────────────

export async function markNotificationRead(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/account/notifications");
  return { ok: true, data: { id } };
}

export async function markAllNotificationsRead(): Promise<ActionResult<{ count: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/account/notifications");
  return { ok: true, data: { count: data } };
}
