import { createInterestHandlers } from "@/lib/server/interests-bff.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return createInterestHandlers().get(request); }
export async function PUT(request: Request) { return createInterestHandlers().put(request); }
