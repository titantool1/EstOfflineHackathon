import "server-only";
import { createSpringClient } from "./spring-client.ts";

type Health = { status: "UP"; database: "UP" };

function isHealth(value: unknown): value is Health {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && "status" in value && value.status === "UP" && "database" in value && value.database === "UP";
}

export async function checkSpringHealth(requestId?: string | null, signal?: AbortSignal) {
  const client = createSpringClient({ baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080" });
  return client.request("/api/health", { validate: isHealth, requestId, signal });
}
