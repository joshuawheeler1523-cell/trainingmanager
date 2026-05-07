"use client";

import { useState } from "react";
import BucketsTab from "./buckets-tab";
import GlobalTab from "./global-tab";
import GroupsTab from "./groups-tab";
import IndividualsTab from "./individuals-tab";
import type {
  AllocationBucket,
  AllocationGroup,
  AllocationGroupMember,
  GlobalAllocation,
  GroupAllocation,
  IndividualAllocation,
  Instructor,
} from "@arbor/shared";

type Tab = "buckets" | "global" | "groups" | "individuals";

const TABS: { id: Tab; label: string }[] = [
  { id: "buckets", label: "Buckets" },
  { id: "global", label: "Global (Default)" },
  { id: "groups", label: "Groups" },
  { id: "individuals", label: "Individuals" },
];

type Props = {
  buckets: AllocationBucket[];
  globals: GlobalAllocation[];
  groups: AllocationGroup[];
  groupMembers: AllocationGroupMember[];
  groupAllocations: GroupAllocation[];
  instructors: Instructor[];
  individualAllocations: IndividualAllocation[];
  globalDefaultUserCount: number;
};

export default function AllocationsView(props: Props) {
  const [tab, setTab] = useState<Tab>("buckets");

  return (
    <div>
      <div className="border-border bg-background border-b px-6">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {tab === "buckets" && <BucketsTab buckets={props.buckets} />}
        {tab === "global" && (
          <GlobalTab
            buckets={props.buckets}
            globals={props.globals}
            defaultUserCount={props.globalDefaultUserCount}
          />
        )}
        {tab === "groups" && (
          <GroupsTab
            buckets={props.buckets}
            groups={props.groups}
            members={props.groupMembers}
            groupAllocations={props.groupAllocations}
            instructors={props.instructors}
          />
        )}
        {tab === "individuals" && (
          <IndividualsTab
            buckets={props.buckets}
            instructors={props.instructors}
            globals={props.globals}
            groups={props.groups}
            groupAllocations={props.groupAllocations}
            groupMembers={props.groupMembers}
            individualAllocations={props.individualAllocations}
          />
        )}
      </div>
    </div>
  );
}
