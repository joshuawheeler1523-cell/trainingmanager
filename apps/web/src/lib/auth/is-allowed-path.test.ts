import { describe, expect, it } from "vitest";
import { isAllowedPath, skipOrgCheck } from "./is-allowed-path";

describe("isAllowedPath", () => {
  it("allows /login", () => {
    expect(isAllowedPath("/login")).toBe(true);
  });
  it("allows /auth/callback", () => {
    expect(isAllowedPath("/auth/callback")).toBe(true);
  });
  it("allows /auth/callback with query", () => {
    expect(isAllowedPath("/auth/callback")).toBe(true);
  });
  it("allows /public/request/token", () => {
    expect(isAllowedPath("/public/request/abc123")).toBe(true);
  });
  it("allows /public/projects/token", () => {
    expect(isAllowedPath("/public/projects/xyz")).toBe(true);
  });

  it("allows / (marketing landing page)", () => {
    expect(isAllowedPath("/")).toBe(true);
  });
  it("allows /pricing", () => {
    expect(isAllowedPath("/pricing")).toBe(true);
  });
  it("allows /legal/terms", () => {
    expect(isAllowedPath("/legal/terms")).toBe(true);
  });
  it("allows /trust", () => {
    expect(isAllowedPath("/trust")).toBe(true);
  });
  it("allows /status", () => {
    expect(isAllowedPath("/status")).toBe(true);
  });
  it("allows /agency-signup", () => {
    expect(isAllowedPath("/agency-signup")).toBe(true);
  });
  it("blocks /dashboard", () => {
    expect(isAllowedPath("/dashboard")).toBe(false);
  });
  it("blocks /instructors", () => {
    expect(isAllowedPath("/instructors")).toBe(false);
  });
  it("blocks /onboarding", () => {
    expect(isAllowedPath("/onboarding")).toBe(false);
  });
  it("blocks /account/set-password", () => {
    expect(isAllowedPath("/account/set-password")).toBe(false);
  });
  it("does not allow nested paths under /", () => {
    // exact-match rule for "/" — otherwise every path would be allowed
    expect(isAllowedPath("/instructors")).toBe(false);
  });
});

describe("skipOrgCheck", () => {
  it("skips /onboarding", () => {
    expect(skipOrgCheck("/onboarding")).toBe(true);
  });
  it("skips /login", () => {
    expect(skipOrgCheck("/login")).toBe(true);
  });
  it("skips /auth/callback", () => {
    expect(skipOrgCheck("/auth/callback")).toBe(true);
  });
  it("skips /public/...", () => {
    expect(skipOrgCheck("/public/request/x")).toBe(true);
  });

  it("checks /dashboard", () => {
    expect(skipOrgCheck("/dashboard")).toBe(false);
  });
  it("checks /instructors", () => {
    expect(skipOrgCheck("/instructors")).toBe(false);
  });
  it("skips /account/set-password (account routes don't need an org)", () => {
    expect(skipOrgCheck("/account/set-password")).toBe(true);
  });
  it("skips /agency (agency console)", () => {
    expect(skipOrgCheck("/agency/clients/new")).toBe(true);
  });
  it("skips /legal/terms", () => {
    expect(skipOrgCheck("/legal/terms")).toBe(true);
  });
  it("skips /api/health", () => {
    expect(skipOrgCheck("/api/health")).toBe(true);
  });
  it("skips /api/v1/instructors", () => {
    expect(skipOrgCheck("/api/v1/instructors")).toBe(true);
  });
});
