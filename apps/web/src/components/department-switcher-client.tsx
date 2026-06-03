"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronUpDownIcon, CheckIcon, Squares2X2Icon } from "@heroicons/react/20/solid";
import { switchDepartment } from "@/app/(authenticated)/department/actions";

type Dept = { id: string; name: string };

type Props = {
  departments: Dept[];
  currentDepartmentId: string | null;
  isManager: boolean;
  allActive: boolean;
};

export default function DepartmentSwitcherClient({
  departments,
  currentDepartmentId,
  isManager,
  allActive,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  const active = allActive
    ? { id: "all", name: "All departments" }
    : (departments.find((d) => d.id === currentDepartmentId) ?? departments[0]);
  if (!active) return null;

  const hasChoices = departments.length > 1 || isManager;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="text-foreground hover:bg-surface flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      >
        <Squares2X2Icon className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="max-w-[160px] truncate">{active.name}</span>
        {hasChoices && <ChevronUpDownIcon className="text-muted-foreground h-4 w-4 shrink-0" />}
      </button>

      {open && departments.length > 0 && (
        <div className="border-border bg-background absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border py-1 shadow-lg">
          <p className="text-muted-foreground px-3 py-1 text-xs font-medium">Switch department</p>
          {isManager && (
            <form action={switchDepartment}>
              <input type="hidden" name="departmentId" value="all" />
              <input type="hidden" name="returnPath" value={pathname} />
              <button
                type="submit"
                className="text-foreground hover:bg-surface flex w-full items-center gap-2 px-3 py-2 text-sm"
              >
                <Squares2X2Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">All departments</span>
                {allActive && <CheckIcon className="text-primary h-4 w-4 shrink-0" />}
              </button>
            </form>
          )}
          {departments.map((d) => (
            <form key={d.id} action={switchDepartment}>
              <input type="hidden" name="departmentId" value={d.id} />
              <input type="hidden" name="returnPath" value={pathname} />
              <button
                type="submit"
                className="text-foreground hover:bg-surface flex w-full items-center gap-2 px-3 py-2 text-sm"
              >
                <Squares2X2Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">{d.name}</span>
                {!allActive && d.id === currentDepartmentId && (
                  <CheckIcon className="text-primary h-4 w-4 shrink-0" />
                )}
              </button>
            </form>
          ))}
          {isManager && (
            <>
              <hr className="border-border my-1" />
              <a
                href="/admin/departments"
                onClick={() => {
                  setOpen(false);
                }}
                className="text-muted-foreground hover:bg-surface hover:text-foreground block px-3 py-2 text-xs"
              >
                Manage departments →
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
