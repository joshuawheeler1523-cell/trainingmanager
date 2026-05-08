"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import { createDepartment, renameDepartment, deleteDepartment } from "./actions";

type DeptRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  instructorCount: number;
};

export default function DepartmentsClient({ departments }: { departments: DeptRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");

  function handleCreate() {
    if (!createName.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const result = await createDepartment({ name: createName, description: createDesc });
      if (result.ok) {
        toast.success("Department created");
        setCreateOpen(false);
        setCreateName("");
        setCreateDesc("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRename(id: string, current: string) {
    const next = window.prompt("New name:", current);
    if (next === null || next.trim() === current) return;
    startTransition(async () => {
      const result = await renameDepartment(id, next);
      if (result.ok) {
        toast.success("Renamed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteDepartment(id);
      if (result.ok) {
        toast.success("Department deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {departments.length} department{departments.length === 1 ? "" : "s"} in this org.
        </p>
        <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              New department
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
              <Dialog.Title className="text-foreground text-base font-semibold">
                New department
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground mt-1 text-xs">
                Departments are isolated workspaces inside your org — separate instructors, classes,
                allocations, projects, and TRAs.
              </Dialog.Description>
              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="dept-name"
                    className="text-foreground mb-1 block text-sm font-medium"
                  >
                    Name *
                  </label>
                  <input
                    id="dept-name"
                    type="text"
                    value={createName}
                    onChange={(e) => {
                      setCreateName(e.target.value);
                    }}
                    placeholder="Clinical Education"
                    className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  />
                </div>
                <div>
                  <label
                    htmlFor="dept-desc"
                    className="text-foreground mb-1 block text-sm font-medium"
                  >
                    Description (optional)
                  </label>
                  <textarea
                    id="dept-desc"
                    rows={3}
                    value={createDesc}
                    onChange={(e) => {
                      setCreateDesc(e.target.value);
                    }}
                    placeholder="What does this department cover?"
                    className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleCreate}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      <div className="border-border bg-background overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-border bg-surface border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                Department
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                Instructors
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                Slug
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {departments.map((d) => (
              <tr key={d.id} className="hover:bg-surface">
                <td className="px-4 py-3">
                  <p className="text-foreground font-medium">{d.name}</p>
                  {d.description && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{d.description}</p>
                  )}
                </td>
                <td className="text-foreground px-4 py-3 tabular-nums">{d.instructorCount}</td>
                <td className="text-muted-foreground px-4 py-3 font-mono text-xs">{d.slug}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleRename(d.id, d.name);
                      }}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs disabled:opacity-50"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDelete(d.id, d.name);
                      }}
                      className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
