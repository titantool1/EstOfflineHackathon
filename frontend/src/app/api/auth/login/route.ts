import { proxySession } from "@/lib/server/session-proxy";
export const runtime = "nodejs";
export function POST(request: Request) { return proxySession(request, "/api/auth/login"); }
