import Link from "next/link";
import {
  ClipboardDocumentListIcon,
  Cog8ToothIcon,
  EnvelopeIcon,
  LinkIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  Squares2X2Icon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import PageHeader from "@/components/ui/page-header";

const TILES = [
  {
    href: "/admin/team",
    title: "Team",
    description: "Manage members, roles, and visibility scopes.",
    Icon: UsersIcon,
  },
  {
    href: "/admin/invitations",
    title: "Invitations",
    description: "Pending invites — re-send or revoke.",
    Icon: EnvelopeIcon,
  },
  {
    href: "/admin/settings",
    title: "Settings",
    description: "Org profile, time zone, brand color, notifications, feature flags.",
    Icon: Cog8ToothIcon,
  },
  {
    href: "/admin/settings/workspace",
    title: "Workspace identity",
    description:
      "Pick a workspace preset, override terminology (Instructor → Trainer, etc.), or toggle modules on/off.",
    Icon: PuzzlePieceIcon,
  },
  {
    href: "/admin/audit-log",
    title: "Audit log",
    description: "Every change to org data, with field-level diffs.",
    Icon: ClipboardDocumentListIcon,
  },
  {
    href: "/admin/intake-links",
    title: "Public intake links",
    description: "Tokenized URLs for the education request form.",
    Icon: LinkIcon,
  },
  {
    href: "/admin/seed-demo",
    title: "Demo organization",
    description: "Spin up Riverside Memorial Hospital with full demo data.",
    Icon: SparklesIcon,
  },
  {
    href: "/admin/departments",
    title: "Departments",
    description:
      "Sub-org isolation. Create departments inside this org for separate instructors, allocations, classes, and projects.",
    Icon: Squares2X2Icon,
  },
];

export default function AdminLandingPage() {
  return (
    <div>
      <PageHeader
        title="Organization administration"
        description="Member management, settings, audit log, and intake links."
      />
      <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2 lg:grid-cols-3">
        {TILES.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="border-border bg-background hover:border-primary group block rounded-xl border p-5 transition-colors"
          >
            <Icon className="text-muted-foreground group-hover:text-primary h-5 w-5" />
            <p className="text-foreground group-hover:text-primary mt-3 text-base font-semibold">
              {title}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
