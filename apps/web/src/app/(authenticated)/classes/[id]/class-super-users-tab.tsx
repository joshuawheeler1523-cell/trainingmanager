"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircleIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import SuperUserFormDialog from "@/app/(authenticated)/super-users/super-user-form-dialog";
import {
  markSuperUserTrained,
  softDeleteSuperUser,
} from "@/app/(authenticated)/super-users/actions";
import type { SuperUser } from "@arbor/shared";

type Props = {
  classId: string;
  className: string;
  superUsers: SuperUser[];
};

export default function ClassSuperUsersTab({ classId, className, superUsers }: Props) {
  const trainedCount = superUsers.filter((s) => s.trained_at != null).length;
  const untrainedCount = superUsers.length - trainedCount;
  const classOption = { id: classId, name: className };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-semibold">
            {superUsers.length} super user{superUsers.length === 1 ? "" : "s"} for this class
          </p>
          {superUsers.length > 0 && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {trainedCount} trained · {untrainedCount} pending
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/super-users?class=${classId}`}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            View on full page →
          </Link>
          <SuperUserFormDialog
            mode="create"
            classes={[classOption]}
            defaultClassId={classId}
            trigger={
              <button
                type="button"
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                Add super user
              </button>
            }
          />
        </div>
      </div>

      {superUsers.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No super users for this class yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add staff members who have been trained as super users / champions on this class.
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-x-auto rounded-lg border">
          <table className="divide-border min-w-full divide-y text-sm">
            <thead className="bg-surface">
              <tr className="text-muted-foreground text-left text-[11px] font-medium uppercase tracking-wide">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Trained</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {superUsers.map((su) => (
                <RowItem key={su.id} su={su} classOption={classOption} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowItem({
  su,
  classOption,
}: {
  su: SuperUser;
  classOption: { id: string; name: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleTrained() {
    startTransition(async () => {
      const result = await markSuperUserTrained(su.id, su.trained_at == null);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await softDeleteSuperUser(su.id);
      if (result.ok) {
        toast.success("Archived");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <tr>
      <td className="text-foreground px-3 py-2 font-medium">
        {su.full_name}
        {su.topic && <span className="text-muted-foreground ml-2 text-xs">· {su.topic}</span>}
      </td>
      <td className="text-muted-foreground px-3 py-2">{su.unit ?? "—"}</td>
      <td className="text-muted-foreground px-3 py-2 text-xs">
        {su.email && (
          <a href={`mailto:${su.email}`} className="hover:text-foreground block">
            {su.email}
          </a>
        )}
        {su.phone && (
          <a href={`tel:${su.phone}`} className="hover:text-foreground block">
            {su.phone}
          </a>
        )}
        {!su.email && !su.phone && "—"}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={toggleTrained}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            su.trained_at
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
          } disabled:opacity-50`}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {su.trained_at ? `Trained · ${su.trained_at}` : "Not trained"}
        </button>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <SuperUserFormDialog
            mode="edit"
            classes={[classOption]}
            superUser={su}
            trigger={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground rounded p-1"
                aria-label="Edit"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            }
          />
          <button
            type="button"
            onClick={handleArchive}
            disabled={pending}
            className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
            aria-label="Archive"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
