"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  addUserToOrgAction,
  changeUserAgencyRoleAction,
  changeUserOrgRoleAction,
  removeUserFromAgencyAction,
  removeUserFromOrgAction,
} from "../actions";

type OrgMembership = {
  org_id: string;
  role: "manager" | "instructor" | "viewer";
  org_name: string;
  org_slug: string;
};

type AgencyMembership = {
  agency_id: string;
  role: "agency_admin" | "agency_member";
  agency_name: string;
  agency_slug: string;
};

type OrgOption = { id: string; name: string; slug: string };

type Props = {
  userId: string;
  userEmail: string;
  orgMemberships: OrgMembership[];
  agencyMemberships: AgencyMembership[];
  allOrgs: OrgOption[];
};

const ORG_ROLE_HELP: Record<OrgMembership["role"], string> = {
  manager: "Full control: invite/remove users, change roles, edit all settings.",
  instructor: "Can view + edit operational data (classes, schedules) but cannot manage users.",
  viewer: "Read-only access to selected modules.",
};

const AGENCY_ROLE_HELP: Record<AgencyMembership["role"], string> = {
  agency_admin: "Full control: create client orgs, manage branding/domain, invite agency members.",
  agency_member: "View client orgs and shared agency settings; no destructive actions.",
};

export default function Memberships(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingOrgId, setAddingOrgId] = useState("");
  const [addingOrgRole, setAddingOrgRole] = useState<OrgMembership["role"]>("instructor");

  function refresh() {
    router.refresh();
  }

  function changeOrgRole(orgId: string, role: OrgMembership["role"]) {
    startTransition(async () => {
      const result = await changeUserOrgRoleAction({ userId: props.userId, orgId, role });
      if (result.ok) {
        toast.success("Role updated");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function removeFromOrg(orgId: string, orgName: string) {
    if (!confirm(`Remove ${props.userEmail} from ${orgName}?`)) return;
    startTransition(async () => {
      const result = await removeUserFromOrgAction({ userId: props.userId, orgId });
      if (result.ok) {
        toast.success("Removed");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleAdd() {
    if (!addingOrgId) {
      toast.error("Pick an org first");
      return;
    }
    startTransition(async () => {
      const result = await addUserToOrgAction({
        userId: props.userId,
        orgId: addingOrgId,
        role: addingOrgRole,
      });
      if (result.ok) {
        toast.success("Added to org");
        setAddingOrgId("");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function changeAgencyRole(agencyId: string, role: AgencyMembership["role"]) {
    startTransition(async () => {
      const result = await changeUserAgencyRoleAction({
        userId: props.userId,
        agencyId,
        role,
      });
      if (result.ok) {
        toast.success("Agency role updated");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function removeFromAgency(agencyId: string, agencyName: string) {
    if (!confirm(`Remove ${props.userEmail} from ${agencyName}?`)) return;
    startTransition(async () => {
      const result = await removeUserFromAgencyAction({ userId: props.userId, agencyId });
      if (result.ok) {
        toast.success("Removed from agency");
        refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const memberOrgIds = new Set(props.orgMemberships.map((m) => m.org_id));
  const availableOrgs = props.allOrgs.filter((o) => !memberOrgIds.has(o.id));

  return (
    <section className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border flex items-baseline justify-between border-b px-5 py-3">
        <h2 className="text-foreground text-base font-bold">
          Memberships ({(props.orgMemberships.length + props.agencyMemberships.length).toString()})
        </h2>
        <p className="text-muted-foreground text-xs">Roles change immediately on selection</p>
      </div>

      {/* Orgs */}
      <div className="border-border border-b">
        <div className="border-border bg-surface border-b px-5 py-2">
          <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
            Organizations ({props.orgMemberships.length.toString()})
          </h3>
        </div>
        {props.orgMemberships.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm italic">No org memberships.</p>
        ) : (
          <ul className="divide-border divide-y">
            {props.orgMemberships.map((m) => (
              <li key={m.org_id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/arbor/orgs/${m.org_id}`}
                    className="text-foreground hover:text-primary text-sm font-medium"
                  >
                    {m.org_name}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 font-mono text-xs">{m.org_slug}</p>
                </div>
                <select
                  value={m.role}
                  onChange={(e) => {
                    changeOrgRole(m.org_id, e.target.value as OrgMembership["role"]);
                  }}
                  disabled={pending}
                  title={ORG_ROLE_HELP[m.role]}
                  className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="manager">manager</option>
                  <option value="instructor">instructor</option>
                  <option value="viewer">viewer</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    removeFromOrg(m.org_id, m.org_name);
                  }}
                  disabled={pending}
                  aria-label="Remove from org"
                  title="Remove from org"
                  className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add to org */}
        <div className="bg-surface/40 flex flex-wrap items-end gap-2 px-5 py-3">
          <div className="min-w-[200px] flex-1">
            <label className="text-muted-foreground mb-1 block text-[11px] font-medium uppercase">
              Add to org
            </label>
            <select
              value={addingOrgId}
              onChange={(e) => {
                setAddingOrgId(e.target.value);
              }}
              disabled={pending || availableOrgs.length === 0}
              className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">
                {availableOrgs.length === 0 ? "User is in every org" : "— Pick an org —"}
              </option>
              {availableOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-medium uppercase">
              Role
            </label>
            <select
              value={addingOrgRole}
              onChange={(e) => {
                setAddingOrgRole(e.target.value as OrgMembership["role"]);
              }}
              disabled={pending}
              title={ORG_ROLE_HELP[addingOrgRole]}
              className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="manager">manager</option>
              <option value="instructor">instructor</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !addingOrgId}
            className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Agencies */}
      <div>
        <div className="border-border bg-surface border-b px-5 py-2">
          <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
            Agencies ({props.agencyMemberships.length.toString()})
          </h3>
        </div>
        {props.agencyMemberships.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm italic">No agency memberships.</p>
        ) : (
          <ul className="divide-border divide-y">
            {props.agencyMemberships.map((m) => (
              <li key={m.agency_id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/arbor/agencies/${m.agency_id}`}
                    className="text-foreground hover:text-primary text-sm font-medium"
                  >
                    {m.agency_name}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 font-mono text-xs">{m.agency_slug}</p>
                </div>
                <select
                  value={m.role}
                  onChange={(e) => {
                    changeAgencyRole(m.agency_id, e.target.value as AgencyMembership["role"]);
                  }}
                  disabled={pending}
                  title={AGENCY_ROLE_HELP[m.role]}
                  className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="agency_admin">agency_admin</option>
                  <option value="agency_member">agency_member</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    removeFromAgency(m.agency_id, m.agency_name);
                  }}
                  disabled={pending}
                  aria-label="Remove from agency"
                  title="Remove from agency"
                  className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
