// Lighthouse CI config. Reads VERCEL_AUTOMATION_BYPASS_SECRET from env so the
// audit can punch through Vercel's preview Standard Protection without putting
// the bypass token into the audited URL (which ends up in the public report).
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        ...(bypass
          ? { extraHeaders: JSON.stringify({ "x-vercel-protection-bypass": bypass }) }
          : {}),
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.85 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": "off",
      },
    },
  },
};
