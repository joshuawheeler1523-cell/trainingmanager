"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PaperAirplaneIcon, TrashIcon } from "@heroicons/react/20/solid";
import { inviteUser, removeMember, updateMember } from "../actions";

export type Role = "manager" | "instructor" | "viewer";

export type MemberRow = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  visibility: "full" | "limited";
  accepted_at: string | null;
  invited_at: string | null;
  created_at: string;
};

type Props = { members: MemberRow[] };

const ROLE_LABEL: Record<Role, string> = {
  manager: "Manager",
  instructor: "Instructor",
  viewer: "Viewer",
};
const ROLE_HELP: Record<Role, string> = {
  manager: "Full control: invite/remove users, change roles, edit all settings.",
  instructor: "Can view + edit operational data (classes, schedules) but cannot manage users.",
  viewer: "Read-only access to selected modules.",
};
const VIS_LABEL = { full: "Full", limited: "Limited" };
const VIS_HELP = {
  full: "Sees all data in the org.",
  limited: "Sees only items they're explicitly assigned to.",
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

export default function TeamView({ members }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("instructor");
  const [inviteVisibility, setInviteVisibility] = useState<"full" | "limited">("full");

  function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    startTransition(async () => {
      const result = await inviteUser({
        email,
        role: inviteRole,
        visibility: inviteVisibility,
      });
      if (result.ok) {
        if (result.data.emailDelivered) {
          toast.success(`Invitation sent to ${email}`);
        } else {
          toast.success(
            `Invitation created. Email delivery is unconfigured — copy this URL: ${result.data.acceptUrl}`,
            { duration: 12000 },
          );
        }
        setInviteEmail("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(m: MemberRow, patch: Partial<Pick<MemberRow, "role" | "visibility">>) {
    startTransition(async () => {
      const result = await updateMember(m.id, patch);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(m: MemberRow) {
    if (
      !confirm(
        `Remove ${m.display_name ?? m.email ?? "this member"}? They'll lose access immediately. Audit history is preserved.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await removeMember(m.id);
      if (result.ok) {
        toast.success("Member removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Invite row */}
      <div className="border-border bg-background flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Invite by email</p>
          <input
            value={inviteEmail}
            onChange={(e) => {
              setInviteEmail(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInvite();
            }}
            type="email"
            placeholder="person@example.com"
            className={fieldClass + " w-full text-sm"}
          />
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Role</p>
          <select
            value={inviteRole}
            onChange={(e) => {
              setInviteRole(e.target.value as Role);
            }}
            title={ROLE_HELP[inviteRole]}
            className={fieldClass}
          >
            <option value="manager">Manager</option>
            <option value="instructor">Instructor</option>
            <option value="viewer">Viewer</option>
          </select>
          <p className="text-muted-foreground mt-1 max-w-[14rem] text-[10px] leading-snug">
            {ROLE_HELP[inviteRole]}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Visibility</p>
          <select
            value={inviteVisibility}
            onChange={(e) => {
              setInviteVisibility(e.target.value as "full" | "limited");
            }}
            title={VIS_HELP[inviteVisibility]}
            className={fieldClass}
          >
            <option value="full">Full</option>
            <option value="limited">Limited</option>
          </select>
          <p className="text-muted-foreground mt-1 max-w-[14rem] text-[10px] leading-snug">
            {VIS_HELP[inviteVisibility]}
          </p>
        </div>
        <button
          type="button"
          disabled={pending || !inviteEmail.trim()}
          onClick={handleInvite}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          Send invite
        </button>
      </div>

      {/* Members table */}
      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted-foreground text-xs">
            <tr>
              <Th>Member</Th>
              <Th>Status</Th>
              <Th>Role</Th>
              <Th>Visibility</Th>
              <Th>Added</Th>
              <Th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center text-xs">
                  No members yet — send an invite above.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">
                    <p className="text-foreground font-medium">
                      {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                    </p>
                    {m.email && m.display_name && (
                      <p className="text-muted-foreground text-xs">{m.email}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.accepted_at ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => {
                        handleUpdate(m, { role: e.target.value as Role });
                      }}
                      title={ROLE_HELP[m.role]}
                      className={fieldClass}
                    >
                      <option value="manager">{ROLE_LABEL.manager}</option>
                      <option value="instructor">{ROLE_LABEL.instructor}</option>
                      <option value="viewer">{ROLE_LABEL.viewer}</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.visibility}
                      disabled={pending}
                      onChange={(e) => {
                        handleUpdate(m, {
                          visibility: e.target.value as MemberRow["visibility"],
                        });
                      }}
                      className={fieldClass}
                    >
                      <option value="full">{VIS_LABEL.full}</option>
                      <option value="limited">{VIS_LABEL.limited}</option>
                    </select>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleRemove(m);
                      }}
                      aria-label="Remove member"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
