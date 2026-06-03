"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { ManagerOnly } from "@/components/auth/role-gate";
import type { ClassModule } from "@arbor/shared";
import { createClassModule, updateClassModule, deleteClassModule } from "./actions";

export type ModuleRow = {
  module: ClassModule;
  classCount: number;
  totalHours: number;
};

const inputCls =
  "border-input bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full";

function ModuleForm({
  initial,
  onCancel,
  onSubmit,
  pending,
}: {
  initial?: { name: string; description: string | null; color: string | null };
  onCancel: () => void;
  onSubmit: (values: { name: string; description: string; color: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "");

  return (
    <div className="border-border bg-background space-y-3 rounded-xl border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">Name *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="New Nurse Onboarding"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">
            Color (optional)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color || "#5a6855"}
              onChange={(e) => {
                setColor(e.target.value);
              }}
              className="border-input h-9 w-10 shrink-0 rounded-md border"
              aria-label="Module color"
            />
            {color && (
              <button
                type="button"
                onClick={() => {
                  setColor("");
                }}
                className="text-muted-foreground hover:text-foreground text-xs underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className="text-muted-foreground mb-1 block text-xs font-medium">Description</label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          placeholder="Optional description…"
          className={inputCls}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() => {
            onSubmit({ name: name.trim(), description, color });
          }}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function ModulesClient({ rows }: { rows: ModuleRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleCreate(values: { name: string; description: string; color: string }) {
    startTransition(async () => {
      const result = await createClassModule(values);
      if (result.ok) {
        toast.success("Module created");
        setCreating(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(id: string, values: { name: string; description: string; color: string }) {
    startTransition(async () => {
      const result = await updateClassModule(id, values);
      if (result.ok) {
        toast.success("Module updated");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteClassModule(id);
      if (result.ok) {
        toast.success("Module deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <ManagerOnly>
        <div className="flex justify-end">
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              New module
            </button>
          )}
        </div>
        {creating && (
          <ModuleForm
            onCancel={() => {
              setCreating(false);
            }}
            onSubmit={handleCreate}
            pending={pending}
          />
        )}
      </ManagerOnly>

      {rows.length === 0 && !creating ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No modules yet. Create one to group related classes together.
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Module
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                  Classes
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                  Annual hrs
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map(({ module, classCount, totalHours }) =>
                editingId === module.id ? (
                  <tr key={module.id}>
                    <td colSpan={4} className="p-3">
                      <ModuleForm
                        initial={{
                          name: module.name,
                          description: module.description,
                          color: module.color,
                        }}
                        onCancel={() => {
                          setEditingId(null);
                        }}
                        onSubmit={(values) => {
                          handleUpdate(module.id, values);
                        }}
                        pending={pending}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={module.id} className="hover:bg-surface">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: module.color ?? "var(--muted-foreground)" }}
                        />
                        <div className="min-w-0">
                          <p className="text-foreground font-medium">{module.name}</p>
                          {module.description && (
                            <p className="text-muted-foreground truncate text-xs">
                              {module.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {classCount > 0 ? (
                        <Link
                          href={`/classes?module=${module.id}`}
                          className="text-primary text-sm font-medium tabular-nums hover:underline"
                        >
                          {classCount}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm tabular-nums">0</span>
                      )}
                    </td>
                    <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                      {totalHours.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ManagerOnly>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(module.id);
                            }}
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <ConfirmDialog
                            trigger={
                              <button
                                type="button"
                                disabled={pending}
                                className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            }
                            title="Delete module?"
                            description="Classes in this module will be unassigned (not deleted). This can't be undone."
                            confirmLabel="Delete"
                            destructive
                            onConfirm={() => {
                              handleDelete(module.id);
                            }}
                          />
                        </div>
                      </ManagerOnly>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
