import { cn } from "@/lib/utils";

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "border-border bg-surface flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="bg-background text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
          {icon}
        </div>
      )}
      <div>
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
