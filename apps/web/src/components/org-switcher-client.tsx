"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ChevronUpDownIcon, CheckIcon, BuildingOfficeIcon } from "@heroicons/react/20/solid";
import { switchOrg } from "@/app/(authenticated)/org/actions";

type Org = { id: string; name: string };

type Props = {
  orgs: Org[];
  currentOrgId: string;
};

export default function OrgSwitcherClient({ orgs, currentOrgId }: Props) {
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

  const active = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];
  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        <BuildingOfficeIcon className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="max-w-[160px] truncate">{active.name}</span>
        {orgs.length > 1 && <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>

      {open && orgs.length > 1 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {orgs.map((org) => (
            <form key={org.id} action={switchOrg}>
              <input type="hidden" name="orgId" value={org.id} />
              <input type="hidden" name="returnPath" value={pathname} />
              <button
                type="submit"
                onClick={() => {
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <BuildingOfficeIcon className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="flex-1 truncate text-left">{org.name}</span>
                {org.id === currentOrgId && (
                  <CheckIcon className="h-4 w-4 shrink-0 text-blue-600" />
                )}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
