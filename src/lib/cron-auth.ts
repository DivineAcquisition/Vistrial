/**
 * Vercel Cron sends Authorization: Bearer CRON_SECRET.
 * Production always requires the secret so a missing env cannot leave
 * ghost/ingest jobs unauthenticated-open or silently 401'd without intent.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    return Boolean(secret) && header === `Bearer ${secret}`;
  }
  if (secret) return header === `Bearer ${secret}`;
  return true;
}
