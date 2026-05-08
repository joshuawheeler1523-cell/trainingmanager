// Shared ticket constants — kept in a NON-"use server" file so client
// components can import them at runtime. (Server-action files can only
// export async functions; values must live elsewhere.)

export const TICKET_CATEGORY_VALUES = [
  "bug",
  "how_to",
  "feature_request",
  "account_billing",
] as const;

export const TICKET_PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;

export const TICKET_STATUS_VALUES = ["open", "pending", "resolved", "closed"] as const;
