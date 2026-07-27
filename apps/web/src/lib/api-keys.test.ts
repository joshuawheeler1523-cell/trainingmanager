import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import { generateApiKey, verifyApiKey, hashApiKey } from "./api-keys";

/** Minimal PostgREST builder stub for `.select().eq().is().maybeSingle()`. */
function stubSelectChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: mockMaybeSingle,
    update: () => chain,
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation(() => stubSelectChain());
});

describe("generateApiKey", () => {
  it.each(["live", "test"] as const)("produces a well-formed %s key", (env) => {
    const { full, prefix } = generateApiKey(env);
    expect(full.startsWith(`arbor_${env}_`)).toBe(true);
    // "arbor_<env>_" is 11 chars, secret is 32.
    expect(full).toHaveLength(43);
    expect(prefix).toHaveLength(23);
    expect(full.startsWith(prefix)).toBe(true);
  });

  it("produces distinct keys across calls", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey("live").full));
    expect(keys.size).toBe(50);
  });
});

describe("verifyApiKey", () => {
  // Regression: KEY_PREFIX_LENGTH was 12 while "arbor_live_" is 11 chars, so the
  // length guard demanded 44 and every freshly generated 43-char key was
  // rejected before it reached the database. The public API authenticated
  // nothing. Guard the round trip, not just the arithmetic.
  it("accepts a key produced by generateApiKey", async () => {
    const { full, prefix } = generateApiKey("live");
    const hash = await hashApiKey(full);
    mockMaybeSingle.mockResolvedValue({
      data: { id: "key-1", org_id: "org-1", key_hash: hash, scopes: ["read"] },
    });

    const result = await verifyApiKey(full);

    expect(result).toEqual({ orgId: "org-1", keyId: "key-1", scopes: ["read"] });
    expect(prefix).toHaveLength(23);
  });

  it("rejects a key whose secret does not match the stored hash", async () => {
    const hash = await hashApiKey(generateApiKey("live").full);
    mockMaybeSingle.mockResolvedValue({
      data: { id: "key-1", org_id: "org-1", key_hash: hash, scopes: ["read"] },
    });

    expect(await verifyApiKey(generateApiKey("live").full)).toBeNull();
  });

  it("rejects an unknown prefix without touching bcrypt", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    expect(await verifyApiKey(generateApiKey("live").full)).toBeNull();
  });

  it.each([
    ["wrong scheme", "sk_live_" + "a".repeat(32)],
    ["too short", "arbor_live_" + "a".repeat(31)],
    ["too long", "arbor_live_" + "a".repeat(33)],
    ["empty", ""],
  ])("rejects a malformed token (%s) before querying", async (_label, token) => {
    expect(await verifyApiKey(token)).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
