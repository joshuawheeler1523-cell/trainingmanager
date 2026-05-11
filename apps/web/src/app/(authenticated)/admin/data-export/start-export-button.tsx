"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startDataExportAction } from "./actions";

export default function StartExportButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Visible elapsed-seconds counter so the user can tell the request is
  // still alive during a long export. Pure cosmetic — no progress signal
  // available since the export runs synchronously inside the action.
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 500);
    return () => {
      clearInterval(interval);
    };
  }, [pending]);

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
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Generating export…" : "Generate export"}
      </button>
      {pending && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {elapsed.toString()}s elapsed · don&apos;t close this tab
        </span>
      )}
    </div>
  );
}
