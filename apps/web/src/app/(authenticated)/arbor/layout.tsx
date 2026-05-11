import Link from "next/link";
import {
  ChartBarSquareIcon,
  BuildingOffice2Icon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { isArborAdmin } from "@/lib/auth/arbor-admin";
import { PROVIDER_IDENTITY } from "@/lib/legal/versions";

export const metadata = {
  title: { default: `Arbor admin — ${PROVIDER_IDENTITY.tradeName}`, template: `%s — Arbor admin` },
};

const NAV = [
  { href: "/arbor", icon: ChartBarSquareIcon, label: "Overview" },
  { href: "/arbor/agencies", icon: BuildingStorefrontIcon, label: "Agencies" },
  { href: "/arbor/orgs", icon: BuildingOffice2Icon, label: "Organizations" },
  { href: "/arbor/users", icon: UserGroupIcon, label: "Users" },
  { href: "/arbor/billing", icon: CurrencyDollarIcon, label: "Billing" },
  { href: "/arbor/audit", icon: DocumentMagnifyingGlassIcon, label: "Audit log" },
  { href: "/arbor/incidents", icon: ExclamationTriangleIcon, label: "Status incidents" },
  { href: "/arbor/baa", icon: ShieldCheckIcon, label: "BAA workflow" },
];

export default async function ArborAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isArborAdmin())) {
    return (
      <div className="bg-canvas flex min-h-screen items-center justify-center px-6">
        <div className="border-border bg-background max-w-md rounded-xl border p-8 text-center">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">
            403
          </p>
          <h1 className="text-foreground mt-2 text-2xl font-bold">Arbor admin only</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            This is the platform-owner console. Your account isn&apos;t in{" "}
            <code className="bg-surface rounded px-1 py-0.5 text-xs">ARBOR_ADMIN_USER_IDS</code>.
          </p>
          <Link
            href="/dashboard"
            className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium"
          >
            Back to your dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-canvas flex min-h-screen">
      {/* Side nav */}
      <aside className="border-border bg-background flex w-60 shrink-0 flex-col border-r">
        <div className="border-border border-b px-4 py-3">
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-widest">
            Arbor admin
          </p>
          <p className="text-foreground mt-0.5 text-base font-bold">Platform console</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-2 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-foreground hover:bg-surface flex items-center gap-2.5 rounded-md px-3 py-2"
            >
              <item.icon className="text-muted-foreground h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-border border-t p-2">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:bg-surface hover:text-foreground flex items-center gap-2.5 rounded-md px-3 py-2 text-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to your workspace
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
