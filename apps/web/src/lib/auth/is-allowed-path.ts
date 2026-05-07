const UNAUTHENTICATED_ALLOWED = ["/login", "/auth/callback", "/public/"];

export function isAllowedPath(pathname: string): boolean {
  return UNAUTHENTICATED_ALLOWED.some((p) => pathname === p || pathname.startsWith(p));
}

const ORG_CHECK_SKIP = ["/onboarding", "/login", "/auth/callback", "/public/"];

export function skipOrgCheck(pathname: string): boolean {
  return ORG_CHECK_SKIP.some((p) => pathname === p || pathname.startsWith(p));
}
