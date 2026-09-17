import { createPhotoHandler } from "@/lib/server/mission-photo/http";
export const runtime = "nodejs";
export const POST = createPhotoHandler();
