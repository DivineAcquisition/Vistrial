export function vapidPublicKey(env = process.env): string | null {
  return env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}
