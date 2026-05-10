import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * White-Label Phase 6 — outbound webhook delivery.
 *
 * Event flow:
 *   1. Server action calls emitWebhookEvent({ orgId, type, data })
 *   2. We look up enabled webhook_endpoints for this org subscribed to
 *      the event type (literal match in the events array)
 *   3. For each match: create a webhook_deliveries row, then attempt
 *      delivery inline with one immediate retry on 5xx
 *   4. Persistent failures keep the row in 'pending' with next_attempt_at
 *      set; a future background worker can pick those up. v1 doesn't
 *      include the worker — failures are surfaced in the deliveries UI
 *      where managers can hit Replay.
 *
 * Signature: X-Arbor-Signature: t=<unix>,sig=<hex of HMAC-SHA256>
 *   payload to sign is `${unixSeconds}.${rawBody}` (Stripe-style; defends
 *   against replay attacks if the customer checks the timestamp).
 */

export function generateSigningSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

function signPayload(secret: string, body: string, unixSeconds: number): string {
  const mac = createHmac("sha256", secret);
  mac.update(`${unixSeconds.toString()}.${body}`);
  return mac.digest("hex");
}

export type EmitArgs = {
  orgId: string;
  type: string; // e.g. "tra.created", "class.completed"
  data: Record<string, unknown>;
};

export async function emitWebhookEvent(args: EmitArgs): Promise<void> {
  const admin = createAdminClient();

  // Endpoints subscribed to this event for this org. `array @> array[type]`
  // checks events column contains the literal event_type.
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, events, signing_secret, enabled")
    .eq("org_id", args.orgId)
    .eq("enabled", true)
    .contains("events", [args.type]);
  if (!endpoints || endpoints.length === 0) return;

  for (const ep of endpoints) {
    const payload = {
      type: args.type,
      data: args.data,
      org_id: args.orgId,
      timestamp: new Date().toISOString(),
    };
    const { data: row } = await admin
      .from("webhook_deliveries")
      .insert({
        endpoint_id: ep.id,
        org_id: args.orgId,
        event_type: args.type,
        payload: payload as unknown as Json,
        status: "pending",
      })
      .select("id")
      .single();
    if (!row) continue;

    // Inline delivery (don't await — we don't want webhooks blocking
    // the parent server action). Errors are recorded on the row.
    void deliverDelivery(row.id);
  }
}

/**
 * Attempts one delivery of a queued webhook_deliveries row. Updates the
 * row with the result. On 5xx / network error, schedules next_attempt_at
 * with exponential backoff (5 attempts max).
 */
export async function deliverDelivery(deliveryId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("webhook_deliveries")
    .select("id, endpoint_id, payload, attempts, status")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row || row.status === "delivered") return;

  const { data: ep } = await admin
    .from("webhook_endpoints")
    .select("url, signing_secret, enabled")
    .eq("id", row.endpoint_id)
    .maybeSingle();
  if (!ep || !ep.enabled) {
    await admin
      .from("webhook_deliveries")
      .update({ status: "failed", response_body: "endpoint disabled or missing" })
      .eq("id", row.id);
    return;
  }

  const body = JSON.stringify(row.payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = signPayload(ep.signing_secret, body, ts);

  let responseCode: number | null = null;
  let responseBody = "";
  let success = false;
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arbor-Signature": `t=${ts.toString()},sig=${sig}`,
        "X-Arbor-Event": String(
          row.payload && typeof row.payload === "object" && "type" in row.payload
            ? (row.payload as { type: unknown }).type
            : "",
        ),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseCode = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 4000);
    success = res.ok;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : "fetch_failed";
  }

  const attempts = row.attempts + 1;
  const MAX_ATTEMPTS = 5;
  if (success) {
    await admin
      .from("webhook_deliveries")
      .update({
        status: "delivered",
        attempts,
        response_code: responseCode,
        response_body: responseBody,
        delivered_at: new Date().toISOString(),
        next_attempt_at: null,
      })
      .eq("id", row.id);
  } else if (attempts >= MAX_ATTEMPTS) {
    await admin
      .from("webhook_deliveries")
      .update({
        status: "failed",
        attempts,
        response_code: responseCode,
        response_body: responseBody,
        next_attempt_at: null,
      })
      .eq("id", row.id);
  } else {
    // Exponential backoff: 1m, 5m, 15m, 60m
    const delaysMs = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
    const delay = delaysMs[attempts - 1] ?? 60 * 60_000;
    const next = new Date(Date.now() + delay).toISOString();
    await admin
      .from("webhook_deliveries")
      .update({
        status: "retrying",
        attempts,
        response_code: responseCode,
        response_body: responseBody,
        next_attempt_at: next,
      })
      .eq("id", row.id);
  }
}
