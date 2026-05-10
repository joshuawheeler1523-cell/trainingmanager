"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startDataExportAction } from "./actions";

export default function StartExportButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await startDataExportAction();
      if (result.ok) {
        toast.success(
          `Export ready: ${result.data.tableCount.toString()} tables, ${result.data.rowCount.toString()} rows`,
        );
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Generating export…" : "Generate export"}
    </button>
  );
}
