const UNAUTHENTICATED_ALLOWED = [
  "/", // marketing landing page
  "/pricing",
  "/login",
  "/auth/callback",
  "/auth/reset",
  "/auth/verify",
  "/accept-invite/", // token-gated set-password page for new users
  "/public/",
  "/feedback/", // token-gated anonymous instructor-feedback (QR) page
  "/agency-signup",
  "/legal",
  "/trust",
  "/status",
  "/api/health",
  "/api/v1/", // Bearer-token auth handled inside the route
];

export function isAllowedPath(pathname: string): boolean {
  // Exact match for "/" so we don't allow every path; prefix match for the rest.
  return UNAUTHENTICATED_ALLOWED.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p),
  );
}

const ORG_CHECK_SKIP = [
  "/",
  "/pricing",
  "/onboarding",
  "/login",
  "/auth/callback",
  "/auth/reset",
  "/auth/verify",
  "/accept-invite/",
  "/public/",
  "/feedback/",
  "/agency",
  "/agency-signup",
  "/legal",
  "/trust",
  "/status",
  "/api/health",
  "/api/v1/",
  "/account",
];

export function skipOrgCheck(pathname: string): boolean {
  return ORG_CHECK_SKIP.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p),
  );
}
