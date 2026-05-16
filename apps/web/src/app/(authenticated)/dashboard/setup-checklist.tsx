import Link from "next/link";
import { CheckCircleIcon, ArrowRightIcon } from "@heroicons/react/20/solid";

type Props = {
  hasMembers: boolean; // > 1 (you + at least one teammate)
  hasInstructors: boolean;
  hasDepartments: boolean; // > 1 (more than just "General")
  hasClasses: boolean;
};

// Renders only when the org looks newly-provisioned (most things still empty).
// Once all steps are done the card hides itself, so this isn't dismissable —
// it just disappears as you make progress.
export default function SetupChecklist(props: Props) {
  const items: { label: string; href: string; done: boolean; help: string }[] = [
    {
      label: "Invite your team",
      href: "/admin/team",
      done: props.hasMembers,
      help: "Send invite emails so managers and instructors can sign in.",
    },
    {
      label: "Add departments",
      href: "/admin/departments",
      done: props.hasDepartments,
      help: "Group instructors and work by unit. Every org starts with one 'General' department.",
    },
    {
      label: "Add instructors",
      href: "/instructors",
      done: props.hasInstructors,
      help: "These are the people whose capacity you're planning. Doesn't require them to have an Arbor sign-in.",
    },
    {
      label: "Create classes",
      href: "/classes",
      done: props.hasClasses,
      help: "Your training catalog. Each class can be scheduled inside a training plan.",
    },
  ];

  const allDone = items.every((i) => i.done);
  if (allDone) return null;

  return (
    <section className="border-primary/30 bg-primary/[0.03] rounded-xl border p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-foreground text-sm font-semibold">Get your workspace set up</h2>
        <span className="text-muted-foreground text-xs">
          {items.filter((i) => i.done).length} of {items.length} complete
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="border-border bg-background hover:bg-surface flex items-start gap-3 rounded-lg border p-3 transition-colors"
            >
              <CheckCircleIcon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  item.done ? "text-emerald-500" : "text-muted-foreground/30"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    item.done ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {item.label}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">{item.help}</p>
              </div>
              {!item.done && (
                <ArrowRightIcon className="text-muted-foreground mt-1 h-4 w-4 shrink-0" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
