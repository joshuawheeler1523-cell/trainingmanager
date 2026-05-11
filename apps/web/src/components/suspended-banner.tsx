import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { PROVIDER_IDENTITY } from "@/lib/legal/versions";

/**
 * Full-page block shown when a user lands on a suspended tenant
 * (org or agency). Replaces the dashboard render so the user sees
 * something explanatory rather than a half-loaded page.
 */
export default function SuspendedBanner({
  scope,
  reason,
}: {
  scope: "agency" | "org";
  reason: string | null;
}) {
  return (
    <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md rounded-xl border border-amber-300 bg-amber-50 p-8 text-center dark:bg-amber-900/20">
        <ExclamationTriangleIcon className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400" />
        <h1 className="text-foreground mt-4 text-2xl font-bold">Account suspended</h1>
        <p className="text-foreground mt-3 text-sm">
          Your {scope === "agency" ? "agency" : "organization"} has been temporarily suspended by{" "}
          {PROVIDER_IDENTITY.tradeName}. While suspended, you can&apos;t access the workspace.
        </p>
        {reason && (
          <p className="text-muted-foreground mt-3 text-sm">
            <span className="font-medium">Reason:</span> {reason}
          </p>
        )}
        <p className="text-muted-foreground mt-6 text-xs">
          To restore access, contact{" "}
          <a href={`mailto:${PROVIDER_IDENTITY.supportEmail}`} className="text-primary underline">
            {PROVIDER_IDENTITY.supportEmail}
          </a>
          .
        </p>
        <Link
          href="/account"
          className="text-muted-foreground hover:text-foreground mt-6 inline-block text-xs underline"
        >
          Manage your account
        </Link>
      </div>
    </div>
  );
}
