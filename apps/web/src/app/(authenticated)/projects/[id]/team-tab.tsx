"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  PROJECT_ROLE_VALUES,
  type Instructor,
  type Project,
  type ProjectRole,
  type ProjectTeamMember,
} from "@arbor/shared";
import { addTeamMember, removeTeamMember, updateTeamMember } from "../actions";

type TeamMember = ProjectTeamMember & { instructor: Instructor | null };

type Props = {
  project: Project;
  team: TeamMember[];
  instructors: Instructor[];
};

export default function TeamTab({ project, team, instructors }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(team.map((m) => m.instructor_id));
  const available = instructors.filter((i) => !assignedIds.has(i.id));

  const [pickInstructor, setPickInstructor] = useState("");
  const [pickRole, setPickRole] = useState<ProjectRole>("member");
  const [pickHours, setPickHours] = useState(0);

  function handleAdd() {
    if (!pickInstructor) return;
    startTransition(async () => {
      const result = await addTeamMember(project.id, {
        instructor_id: pickInstructor,
        role: pickRole,
        allocated_hours: pickHours,
      });
      if (result.ok) {
        toast.success("Team member added");
        setPickInstructor("");
        setPickRole("member");
        setPickHours(0);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(m: TeamMember, patch: { role?: ProjectRole; allocated_hours?: number }) {
    startTransition(async () => {
      const result = await updateTeamMember(m.id, project.id, patch);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(memberId: string) {
    startTransition(async () => {
      const result = await removeTeamMember(memberId, project.id);
      if (result.ok) {
        toast.success("Team member removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {team.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No team members yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add instructors below to assign them to this project.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th>Member</Th>
                <Th>Role</Th>
                <Th>Allocated hours</Th>
                <Th className="w-12"></Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {team.map((m) => (
                <tr key={m.id}>
                  <td className="text-foreground px-3 py-2">
                    {m.instructor?.full_name ?? "Unknown"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => {
                        handleUpdate(m, { role: e.target.value as ProjectRole });
                      }}
                      className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs capitalize"
                    >
                      {PROJECT_ROLE_VALUES.map((r) => (
                        <option key={r} value={r} className="capitalize">
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      defaultValue={m.allocated_hours}
                      disabled={pending}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== m.allocated_hours) {
                          handleUpdate(m, { allocated_hours: v });
                        }
                      }}
                      className="border-input bg-background text-foreground w-24 rounded-md border px-2 py-1 text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleRemove(m.id);
                      }}
                      aria-label="Remove team member"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add row */}
      {available.length > 0 ? (
        <div className="border-border bg-background flex items-end gap-2 rounded-lg border p-3">
          <div className="flex-1">
            <p className="text-muted-foreground mb-1 text-xs font-medium">Add instructor</p>
            <select
              value={pickInstructor}
              onChange={(e) => {
                setPickInstructor(e.target.value);
              }}
              className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">Select…</option>
              {available.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <p className="text-muted-foreground mb-1 text-xs font-medium">Role</p>
            <select
              value={pickRole}
              onChange={(e) => {
                setPickRole(e.target.value as ProjectRole);
              }}
              className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm capitalize"
            >
              {PROJECT_ROLE_VALUES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <p className="text-muted-foreground mb-1 text-xs font-medium">Hours</p>
            <input
              type="number"
              min={0}
              step="1"
              value={pickHours}
              onChange={(e) => {
                setPickHours(Number(e.target.value));
              }}
              className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm tabular-nums"
            />
          </div>
          <button
            type="button"
            disabled={pending || !pickInstructor}
            onClick={handleAdd}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      ) : (
        instructors.length > 0 && (
          <p className="text-muted-foreground text-xs">
            All active instructors are already on this project.
          </p>
        )
      )}
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
