const destinations = new Set(["/", "/profile", "/profile/neighborhood", "/onboarding", "/missions", "/missions/detail", "/map/mission", "/chat"]);
// Only known local screens can be return destinations. Keep their query context.
export function loginReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
      || /[\\\u0000-\u0020]/.test(value)) return "/profile";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || !destinations.has(url.pathname)) return "/profile";
    return url.pathname + url.search;
  } catch { return "/profile"; }
}
export function loginHref(returnTo: string, expired = false): string {
  const query = new URLSearchParams({ next: loginReturnPath(returnTo) });
  if (expired) query.set("reason", "session-expired");
  return `/login?${query}`;
}
export const neighborhoodLoginUrl = loginHref("/profile/neighborhood", true);
