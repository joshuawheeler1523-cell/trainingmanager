"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

type Organization = Tables<"organizations">;

type OrgContextValue = {
  orgs: Organization[];
  activeOrg: Organization | null;
  setActiveOrg: (org: Organization) => void;
  loading: boolean;
};

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  activeOrg: null,
  setActiveOrg: () => {},
  loading: true,
});

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: members } = await supabase
        .from("organization_members")
        .select("org_id")
        .order("created_at");

      if (!members?.length) {
        setLoading(false);
        return;
      }

      const orgIds = members.map((m) => m.org_id);
      const { data: orgRows } = await supabase.from("organizations").select("*").in("id", orgIds);

      const fetched = orgRows ?? [];
      setOrgs(fetched);

      const stored = localStorage.getItem("activeOrgId");
      const initial = fetched.find((o) => o.id === stored) ?? fetched[0] ?? null;
      setActiveOrgState(initial);
      setLoading(false);
    }

    void load();
  }, []);

  const setActiveOrg = useCallback((org: Organization) => {
    setActiveOrgState(org);
    localStorage.setItem("activeOrgId", org.id);
  }, []);

  return (
    <OrgContext.Provider value={{ orgs, activeOrg, setActiveOrg, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
