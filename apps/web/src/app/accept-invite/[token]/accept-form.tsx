"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { acceptInvitationAction } from "./actions";

export default function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (result.ok) {
        toast.success("Welcome aboard!");
        router.push("/");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleAccept}
      className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
    >
      <CheckCircleIcon className="h-4 w-4" />
      {pending ? "Accepting…" : "Accept invitation"}
    </button>
  );
}
