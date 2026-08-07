import "server-only";

import { headers } from "next/headers";

/** Best-effort IP and user-agent for activity log and session rows. */
export async function requestMeta(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent");
  return { ipAddress, userAgent };
}
