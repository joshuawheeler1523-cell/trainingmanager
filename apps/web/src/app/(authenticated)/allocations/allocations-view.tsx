"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import BucketsTab from "./buckets-tab";
import BucketConsumptionPanel from "./bucket-consumption-panel";
import TeamUtilizationRoster, { type TeamRosterRow } from "./team-utilization-roster";
import RecommendationsBanner from "@/components/recommendations-banner";

// Summary is the default landing tab — keep it eager so the first paint
// is fully hydrated. Off-landing tabs lazy-load on demand.
const TabLoading = () => <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
const GlobalTab = dynamic(() => import("./global-tab"), { loading: TabLoading });
const GroupsTab = dynamic(() => import("./groups-tab"), { loading: TabLoading });
const IndividualsTab = dynamic(() => import("./individuals-tab"), { loading: TabLoading });
const RecurringTab = dynamic(() => import("./recurring-tab"), { loading: TabLoading });
const AdHocTab = dynamic(() => import("./adhoc-tab"), { loading: TabLoading });
import type {
  AdHocTask,
  AllocationBucket,
  AllocationGroup,
  AllocationGroupMember,
  BucketConsumptionInput,
  GlobalAllocation,
  GroupAllocation,
  IndividualAllocation,
  Instructor,
  Recommendation,
  RecurringTask,
  RecurringTaskAssignment,
} from "@arbor/shared";

type Tab = "summary" | "buckets" | "global" | "groups" | "individuals" | "recurring" | "adhoc";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "buckets", label: "Buckets" },
  { id: "global", label: "Global (Default)" },
  { id: "groups", label: "Groups" },
  { id: "individuals", label: "Individuals" },
  { id: "recurring", label: "Recurring" },
  { id: "adhoc", label: "Ad-Hoc" },
];

type Props = {
  buckets: AllocationBucket[];
  allBuckets: AllocationBucket[];
  globals: GlobalAllocation[];
  groups: AllocationGroup[];
  groupMembers: AllocationGroupMember[];
  groupAllocations: GroupAllocation[];
  instructors: Instructor[];
  individualAllocations: IndividualAllocation[];
  globalDefaultUserCount: number;
  recurringTasks: RecurringTask[];
  recurringAssignments: RecurringTaskAssignment[];
  adHocTasks: AdHocTask[];
  recommendations: Recommendation[];
  /** Read-only summary inputs for the Summary tab. */
  rosterRows: TeamRosterRow[];
  bucketConsumption: BucketConsumptionInput[];
  totalOrgHours: number;
};

export default function AllocationsView(props: Props) {
  const [tab, setTab] = useState<Tab>("summary");

  return (
    <div>
      <div className="border-border bg-background border-b px-6">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`shrink-0 border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
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

      <div className="space-y-4 p-6">
        {/* Bucket-overconsumption warnings live here — the fix (rebalancing
            targets or reassigning hours) happens on this page. Hidden on
            the Summary tab since the same info renders in the panel. */}
        {tab !== "summary" && (
          <RecommendationsBanner
            title="Bucket warnings"
            recommendations={props.recommendations}
            defaultExpanded={false}
          />
        )}
        {tab === "summary" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
            <TeamUtilizationRoster buckets={props.buckets} rows={props.rosterRows} />
            <BucketConsumptionPanel
              consumption={props.bucketConsumption}
              totalOrgHours={props.totalOrgHours}
            />
          </div>
        )}
        {tab === "buckets" && <BucketsTab buckets={props.allBuckets} />}
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
        {tab === "recurring" && (
          <RecurringTab
            tasks={props.recurringTasks}
            assignments={props.recurringAssignments}
            buckets={props.buckets}
            instructors={props.instructors}
          />
        )}
        {tab === "adhoc" && (
          <AdHocTab
            tasks={props.adHocTasks}
            buckets={props.buckets}
            instructors={props.instructors}
          />
        )}
      </div>
    </div>
  );
}
