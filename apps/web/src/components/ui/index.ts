// Shared UI primitives. New pages should import from here instead of
// re-rolling the recipe locally. Existing pages migrate at their own
// pace via separate PRs.

export { Badge, type BadgeVariant } from "./badge";
export { Button, type ButtonSize, type ButtonVariant } from "./button";
export { Card, type CardVariant } from "./card";
export { Drawer, type DrawerSize } from "./drawer";
export { Field } from "./field";
export { Heading, type HeadingLevel } from "./heading";
export { Input, Select, Textarea } from "./input";
export { Modal, type ModalSize } from "./modal";
export { Skeleton, SkeletonLine, SkeletonStack } from "./skeleton";
export { Tabs, type TabItem } from "./tabs";

// Older primitives kept available from the same barrel.
export { default as ConfirmDialog } from "./confirm-dialog";
export { default as DataTable } from "./data-table";
export { default as EmptyState } from "./empty-state";
export { default as PageHeader } from "./page-header";
export { default as UtilizationBadge } from "./utilization-badge";
