import "server-only";
import { isManager } from "./role";

/**
 * @deprecated Phase 2 of the permissions overhaul renamed `org_admin` → `manager`.
 * Use `isManager` from `@/lib/auth/role` directly. This re-export is kept for one
 * migration cycle and will be removed in Phase 7.
 */
export const isOrgAdmin = isManager;
