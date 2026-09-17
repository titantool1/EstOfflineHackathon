import { loginHref } from "./login-return.ts";

type Location = { href: string; replace: (url: string) => void };
const memberPages = new Set(["/profile", "/profile/neighborhood", "/onboarding", "/missions", "/missions/detail", "/map/mission", "/chat"]);
const browserLocation = (): Location | null => typeof window === "undefined" ? null : window.location;

export function redirectToLogin(location: Location | null = browserLocation()) {
  if (!location) return;
  const url = new URL(location.href);
  if (memberPages.has(url.pathname)) location.replace(loginHref(url.pathname + url.search, true));
}

async function requiresLogin(response: Response) {
  if (response.status !== 401 || response.headers.has("WWW-Authenticate")) return false;
  try {
    const value = await response.clone().json();
    return value?.error?.code === "AUTHENTICATION_REQUIRED";
  } catch { return false; }
}

// Only app member requests participate. Never patch global fetch or retry a write.
export function createSessionFetch(fetcher: typeof fetch, locate: () => Location | null = browserLocation): typeof fetch {
  let redirectingFrom: string | null = null;
  return async (input, init) => {
    const location = locate();
    const startedAt = location?.href;
    const response = await fetcher(input, init);
    if (!location || !startedAt) return response;
    const page = new URL(startedAt);
    const request = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, page.origin);
    const protectedRequest = request.origin === page.origin && (request.pathname === "/api/auth/me"
      || request.pathname === "/api/chat" || request.pathname.startsWith("/api/profile/")
      || request.pathname.startsWith("/api/missions/"));
    if (!protectedRequest || !memberPages.has(page.pathname)) return response;
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const stillHere = () => !signal?.aborted && locate()?.href === startedAt;
    if (!stillHere()) return response;
    let expired = await requiresLogin(response);
    let failure = response;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    // A fresh anonymous CSRF token can produce 403 after a member session expires.
    // Verify the session; a permission denial or a failed check is not expiry.
    if (!expired && response.status === 403 && method !== "GET" && method !== "HEAD") {
      try {
        const member = await fetcher("/api/auth/me", { cache: "no-store", credentials: "same-origin", redirect: "error", signal });
        expired = await requiresLogin(member);
        if (expired) failure = member;
      } catch { /* Keep the original error when authentication could not be checked. */ }
    }
    if (expired && stillHere() && redirectingFrom !== startedAt) {
      redirectingFrom = startedAt;
      redirectToLogin(locate());
    }
    return failure;
  };
}

export const sessionFetch = createSessionFetch((input, init) => fetch(input, init));
