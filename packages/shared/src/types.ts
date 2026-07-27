/**
 * Return contract for every server action. Actions never throw — they resolve
 * to one of these so the caller handles failure as data rather than as an
 * exception boundary.
 *
 * `field` names the form input a validation failure belongs to, letting a
 * client bind the message to the right control. It was previously omitted from
 * 13 of the 42 copy-pasted local definitions of this type, so an action that
 * set it could not be read consistently by its caller. Keep this the single
 * definition.
 */
export type ActionError = {
  code: string;
  message: string;
  field?: string;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export type OrgRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface AuditLog {
  id: string;
  org_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
