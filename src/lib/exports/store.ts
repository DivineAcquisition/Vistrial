import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { EXPORT_BUCKET } from "@/lib/portal/export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const TTL_SECONDS = 7 * 24 * 60 * 60;

export async function storeExportFile(args: {
  orgId: string;
  userId: string;
  kind: string;
  fileName: string;
  contentType: string;
  body: string | Uint8Array;
  params?: Record<string, unknown>;
  recordCount?: number;
}): Promise<{ jobId: string; path: string }> {
  const admin = getSupabaseAdmin() as unknown as SupabaseClient;
  const jobId = crypto.randomUUID();
  const path = `${args.orgId}/${jobId}-${args.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const bytes = typeof args.body === "string" ? new TextEncoder().encode(args.body) : args.body;
  const uploaded = await getSupabaseAdmin().storage.from(EXPORT_BUCKET).upload(path, bytes, {
    contentType: args.contentType,
    upsert: false,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const { error } = await admin.from("export_jobs").insert({
    id: jobId,
    org_id: args.orgId,
    requested_by_user_id: args.userId,
    kind: args.kind,
    params: args.params ?? {},
    status: "ready",
    record_count: args.recordCount ?? null,
    storage_path: path,
    content_type: args.contentType,
    file_name: args.fileName,
    expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await admin.rpc("ws_log", {
    p_org_id: args.orgId,
    p_action: "export.created",
    p_target_table: "export_jobs",
    p_target_id: jobId,
    p_detail: { kind: args.kind, records: args.recordCount ?? null },
    p_actor_user_id: args.userId,
  });
  return { jobId, path };
}

export async function signedExportUrl(path: string, fileName: string): Promise<string | null> {
  const signed = await getSupabaseAdmin().storage.from(EXPORT_BUCKET).createSignedUrl(path, 60, { download: fileName });
  return signed.data?.signedUrl ?? null;
}

export function hashDownloadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDownloadToken(): string {
  return randomBytes(24).toString("base64url");
}
