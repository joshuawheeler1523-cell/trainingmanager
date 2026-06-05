/**
 * Versioned identifiers for every legal document. Bumping a date here
 * re-prompts users on next sign-in for re-acceptance and records the
 * new version against their legal_acceptances row.
 *
 * Format: YYYY-MM-DD (effective date of the version, NOT today's date).
 * Coordinate bumps with the doc file at apps/web/src/app/legal/<key>/page.tsx
 * — the heading version must match this constant.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-05-10",
  privacy: "2026-05-10",
  cookies: "2026-05-10",
  dpa: "2026-05-10",
  baa: "2026-05-10",
  aup: "2026-05-10",
  sla: "2026-05-10",
  reseller: "2026-05-10",
  subprocessors: "2026-05-10",
} as const;

export type LegalDocumentKey = keyof typeof LEGAL_VERSIONS;

/**
 * Provider identity used across every legal doc. Pulled from env in
 * production so the user can change entity name / address / contact
 * without touching code. Defaults match Arbor's current ops setup.
 */
export const PROVIDER_IDENTITY = {
  legalName: process.env["ARBOR_LEGAL_NAME"] ?? "Raised Beef AI, LLC",
  tradeName: "Arbor",
  jurisdiction: process.env["ARBOR_LEGAL_JURISDICTION"] ?? "Delaware, USA",
  address: process.env["ARBOR_LEGAL_ADDRESS"] ?? "[Configure ARBOR_LEGAL_ADDRESS]",
  privacyEmail: process.env["ARBOR_PRIVACY_EMAIL"] ?? "privacy@arbor.app",
  legalEmail: process.env["ARBOR_LEGAL_EMAIL"] ?? "legal@arbor.app",
  supportEmail: process.env["ARBOR_SUPPORT_EMAIL"] ?? "support@arbor.app",
  salesEmail: process.env["ARBOR_SALES_EMAIL"] ?? "sales@arbor.app",
  securityEmail: process.env["ARBOR_SECURITY_EMAIL"] ?? "security@arbor.app",
  dpoEmail: process.env["ARBOR_DPO_EMAIL"] ?? "dpo@arbor.app",
};
