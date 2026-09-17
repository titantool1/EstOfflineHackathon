import { createNeighborhoodHandlers } from "@/lib/server/neighborhood-bff.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return createNeighborhoodHandlers().get(request); }
export async function PUT(request: Request) { return createNeighborhoodHandlers().put(request); }
