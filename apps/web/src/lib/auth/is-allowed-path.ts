const UNAUTHENTICATED_ALLOWED = [
  "/login",
  "/auth/callback",
  "/public/",
  "/agency-signup",
  "/api/v1/", // Bearer-token auth handled inside the route
];

export function isAllowedPath(pathname: string): boolean {
  return UNAUTHENTICATED_ALLOWED.some((p) => pathname === p || pathname.startsWith(p));
}

const ORG_CHECK_SKIP = [
  "/onboarding",
  "/login",
  "/auth/callback",
  "/public/",
  "/agency",
  "/agency-signup",
  "/api/v1/",
];

export function skipOrgCheck(pathname: string): boolean {
  return ORG_CHECK_SKIP.some((p) => pathname === p || pathname.startsWith(p));
}
