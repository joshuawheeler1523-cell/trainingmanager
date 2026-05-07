"use client";

import { useState, useRef, useEffect } from "react";
import { useOrg } from "@/lib/org-context";
import { ChevronUpDownIcon, CheckIcon, BuildingOfficeIcon } from "@heroicons/react/20/solid";

export default function OrgSwitcher() {
  const { orgs, activeOrg, setActiveOrg } = useOrg();
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

  if (!activeOrg) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        <BuildingOfficeIcon className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate text-left">{activeOrg.name}</span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                setActiveOrg(org);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <BuildingOfficeIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="flex-1 truncate text-left">{org.name}</span>
              {org.id === activeOrg.id && <CheckIcon className="h-4 w-4 shrink-0 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
