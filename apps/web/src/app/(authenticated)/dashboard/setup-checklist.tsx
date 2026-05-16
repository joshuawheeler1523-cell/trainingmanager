import Link from "next/link";
import { CheckCircleIcon, ArrowRightIcon } from "@heroicons/react/20/solid";
import { Eyebrow } from "@/components/ui";

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

  const doneCount = items.filter((i) => i.done).length;

  return (
    <section className="rounded-xl border border-[rgba(45,74,46,0.20)] bg-[rgba(45,74,46,0.04)] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow className="mb-1.5">Setup</Eyebrow>
          <h2 className="font-display text-foreground text-lg font-medium leading-tight tracking-[-0.005em]">
            Get your workspace set up.
          </h2>
        </div>
        <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
          <b className="text-foreground font-medium tabular-nums">
            {doneCount} / {items.length}
          </b>{" "}
          complete
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
                  item.done ? "text-[var(--forest)]" : "text-muted-foreground/30"
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
