import { createHash } from "node:crypto";

import type { GhlDb } from "@/lib/ghl/tokens";
import {
  AUTH_MAX_ATTEMPTS,
  AUTH_WINDOW_SECONDS,
  MARKETING_MAX_PER_WINDOW,
  MARKETING_WINDOW_SECONDS,
  WEBHOOK_MAX_PER_WINDOW,
  WEBHOOK_WINDOW_SECONDS,
} from "@/lib/ops/constants";

export function requestIp(headersOrRequest: { get(name: string): string | null } | Request): string {
  const headers = "headers" in headersOrRequest ? headersOrRequest.headers : headersOrRequest;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

export function rateLimitKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export async function consumeRateLimit(
  db: GhlDb,
  args: { key: string; limit: number; windowSeconds: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_key: args.key,
    p_limit: args.limit,
    p_window_seconds: args.windowSeconds,
  });
  if (error || !data || typeof data !== "object") {
    return { allowed: true, remaining: args.limit };
  }
  const row = data as { allowed?: boolean; remaining?: number };
  return {
    allowed: row.allowed !== false,
    remaining: typeof row.remaining === "number" ? row.remaining : 0,
  };
}

export async function rateLimitWebhook(db: GhlDb, request: Request, route: string) {
  return consumeRateLimit(db, {
    key: rateLimitKey(["webhook", route, requestIp(request)]),
    limit: WEBHOOK_MAX_PER_WINDOW,
    windowSeconds: WEBHOOK_WINDOW_SECONDS,
  });
}

export async function rateLimitAuth(db: GhlDb, email: string, ip: string) {
  const identity = rateLimitKey(["auth", email.trim().toLowerCase(), ip]);
  return consumeRateLimit(db, {
    key: identity,
    limit: AUTH_MAX_ATTEMPTS,
    windowSeconds: AUTH_WINDOW_SECONDS,
  });
}

export async function rateLimitMarketing(db: GhlDb, request: Request) {
  return consumeRateLimit(db, {
    key: rateLimitKey(["marketing", requestIp(request)]),
    limit: MARKETING_MAX_PER_WINDOW,
    windowSeconds: MARKETING_WINDOW_SECONDS,
  });
}
