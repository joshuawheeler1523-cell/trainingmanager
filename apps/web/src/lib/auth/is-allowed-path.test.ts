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

  it("blocks /", () => {
    expect(isAllowedPath("/")).toBe(false);
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
  it("checks /account/set-password", () => {
    expect(skipOrgCheck("/account/set-password")).toBe(false);
  });
});
