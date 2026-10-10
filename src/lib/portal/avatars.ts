import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Profile photos live in a private bucket at {org}/{member}.{ext}. The path is
 * built here from the person's own seat, never from input, and the database
 * refuses a path that is not theirs.
 */

export const AVATAR_BUCKET = "member-avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function avatarExtension(type: string): "png" | "jpg" | "webp" | null {
  return TYPES[type] ?? null;
}

export function avatarPath(orgId: string, memberId: string, ext: string): string {
  return `${orgId}/${memberId}.${ext}`;
}

export async function storeAvatar(orgId: string, memberId: string, file: File): Promise<{ path: string } | { error: string }> {
  const ext = avatarExtension(file.type);
  if (!ext) return { error: "Use a PNG, JPG, or WebP image." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "Use an image under 2 MB." };
  const path = avatarPath(orgId, memberId, ext);
  const storage = getSupabaseAdmin().storage.from(AVATAR_BUCKET);
  const { error } = await storage.upload(path, file, { upsert: true, contentType: file.type, cacheControl: "60" });
  if (error) return { error: "Could not save that photo." };
  const stale = ["png", "jpg", "webp"].filter((other) => other !== ext).map((other) => avatarPath(orgId, memberId, other));
  await storage.remove(stale);
  return { path };
}

export async function removeAvatar(orgId: string, memberId: string): Promise<void> {
  await getSupabaseAdmin()
    .storage.from(AVATAR_BUCKET)
    .remove(["png", "jpg", "webp"].map((ext) => avatarPath(orgId, memberId, ext)));
}

/** Short-lived links for photos in one workspace. */
export async function avatarUrls(orgId: string, paths: Array<string | null | undefined>): Promise<Map<string, string>> {
  const own = [...new Set(paths.filter((path): path is string => Boolean(path?.startsWith(`${orgId}/`))))];
  if (!own.length) return new Map();
  const { data } = await getSupabaseAdmin().storage.from(AVATAR_BUCKET).createSignedUrls(own, 3600);
  return new Map(
    (data ?? []).flatMap((row) => (row.path && row.signedUrl ? [[row.path, row.signedUrl] as [string, string]] : []))
  );
}
