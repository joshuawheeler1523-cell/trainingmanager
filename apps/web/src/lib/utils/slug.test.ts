import { describe, it, expect } from "vitest";
import { toSlug } from "./slug";

describe("toSlug", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(toSlug("Acme Hospital")).toBe("acme-hospital");
  });

  it("strips special characters", () => {
    expect(toSlug("St. Mary's & Sons")).toBe("st-marys-sons");
  });

  it("collapses multiple hyphens", () => {
    expect(toSlug("a  b")).toBe("a-b");
  });

  it("trims whitespace", () => {
    expect(toSlug("  hello  ")).toBe("hello");
  });
});
