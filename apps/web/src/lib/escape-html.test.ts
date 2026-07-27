import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first so entities aren't double-encoded wrongly", () => {
    // If & were escaped last, "<" would become "&amp;lt;" and render literally.
    expect(escapeHtml("<")).toBe("&lt;");
  });

  it("neutralises a script tag payload", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("neutralises an attribute breakout in both quote styles", () => {
    expect(escapeHtml(`" onerror="alert(1)`)).not.toContain('"');
    expect(escapeHtml(`' onerror='alert(1)`)).not.toContain("'");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(escapeHtml("<<<")).toBe("&lt;&lt;&lt;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Wound Care Level 2 - Cohort A")).toBe("Wound Care Level 2 - Cohort A");
  });
});
