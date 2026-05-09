import { cn } from "@/lib/utils";

type Props = {
  /** Accepts string or ReactNode so callers can interpolate <Label /> for org-customizable copy. */
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export default function PageHeader({ title, description, actions, className }: Props) {
  return (
    <div
      className={cn(
        "border-border bg-background flex items-start justify-between gap-4 border-b px-6 py-4",
        className,
      )}
    >
      <div>
        <h1 className="text-foreground text-xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
