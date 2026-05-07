"use client";

import { useState, useRef, useEffect } from "react";
import { useOrg } from "@/lib/org-context";
import type { Tables } from "@/lib/supabase/database.types";
import { ChevronUpDownIcon, CheckIcon, BuildingOfficeIcon } from "@heroicons/react/20/solid";

type Organization = Tables<"organizations">;

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
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!activeOrg) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <BuildingOfficeIcon className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="truncate flex-1 text-left">{activeOrg.name}</span>
        <ChevronUpDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                setActiveOrg(org);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <BuildingOfficeIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="flex-1 text-left truncate">{org.name}</span>
              {org.id === activeOrg.id && (
                <CheckIcon className="w-4 h-4 text-blue-600 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
