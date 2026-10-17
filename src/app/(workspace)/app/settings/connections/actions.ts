"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { canPrepareConnectLink } from "@/lib/connectors/access";
import { connectorByKey } from "@/lib/connectors/catalog";
import { hashSheet, parseCsv, planRows, suggestColumns, TEMPLATE_CSV } from "@/lib/connectors/files";
import { managesConnections, requireConnectionViewer } from "@/lib/connectors/gate";
import {
  allowSharedAccount,
  createConnectInvite,
  disconnectConnection,
  ensureWebhook,
  fileAlreadyImported,
  listConnections,
  loadConnection,
  pauseConnection,
  recordInterest,
  recordRequest,
  resumeConnection,
  rotateWebhookSecret,
  saveApiKey,
  saveFileImport,
  saveSetup,
  setConnectionStatus,
  setConnectorAccess,
  upsertCatalogConnection,
  writeAudit,
} from "@/lib/connectors/store";
import { testApiKey } from "@/lib/connectors/vendors";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";

function refresh(path = "/app/settings/connections") {
  revalidatePath(path);
}

export async function notifyInterest(connectorKey: string): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!connectorByKey(connectorKey)) return;
  await recordInterest(ctx.org.id, connectorKey, ctx.member.id);
  refresh();
}

export async function submitToolRequest(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  const toolName = String(formData.get("tool_name") ?? "").trim();
  const wanted = String(formData.get("wanted") ?? "").trim();
  const urgency = String(formData.get("urgency") ?? "soon").trim();
  if (!toolName || !wanted) return;
  await recordRequest({ orgId: ctx.org.id, memberId: ctx.member.id, toolName, wanted, urgency });
  refresh();
}

export async function connectApiKey(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const key = String(formData.get("connector") ?? "");
  const connector = connectorByKey(key);
  const secret = String(formData.get("secret") ?? "").trim();
  if (!connector || connector.method !== "api_key" || !secret) return;
  const tested = await testApiKey(key, secret);
  if (!tested.ok) {
    redirect(`/app/settings/connections/${key}?error=${encodeURIComponent(tested.reason)}`);
  }
  const row = await upsertCatalogConnection({
    orgId: ctx.org.id,
    connector,
    memberId: ctx.member.id,
    externalAccountLabel: tested.label,
    status: "setting_up",
  });
  await saveApiKey(row.id, secret);
  await writeAudit({
    orgId: ctx.org.id,
    connectionId: row.id,
    actorMemberId: ctx.member.id,
    action: "connection.key_changed",
    detail: { last4: secret.slice(-4) },
  });
  redirect(`/app/settings/connections/${key}/setup?connection=${row.id}&connected=${encodeURIComponent(tested.label)}`);
}

export async function connectSimple(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const key = String(formData.get("connector") ?? "");
  const connector = connectorByKey(key);
  if (!connector || (connector.method !== "webhook" && connector.method !== "upload" && connector.method !== "manual")) return;
  const row = await upsertCatalogConnection({
    orgId: ctx.org.id,
    connector,
    memberId: ctx.member.id,
    externalAccountLabel: connector.name,
    status: connector.method === "manual" ? "live" : "setting_up",
  });
  if (connector.method === "webhook") await ensureWebhook(row.id, ctx.org.id);
  redirect(
    connector.method === "manual"
      ? `/app/cases`
      : `/app/settings/connections/${key}/setup?connection=${row.id}`
  );
}

export async function saveMapping(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx) && !ctx.isStaff) return;
  const connectionId = String(formData.get("connection") ?? "");
  const row = await loadConnection(ctx.org.id, connectionId);
  if (!row) return;
  const setup = {
    include: String(formData.get("include") ?? ""),
    stages: String(formData.get("stages") ?? ""),
    record: String(formData.get("record") ?? ""),
  };
  await saveSetup(ctx.org.id, connectionId, setup, "preview", ctx.isStaff ? null : ctx.member.id);
  refresh(`/app/settings/connections/${row.connector_key}/setup`);
}

export async function startImport(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const connectionId = String(formData.get("connection") ?? "");
  const row = await loadConnection(ctx.org.id, connectionId);
  if (!row) return;
  await setConnectionStatus({
    orgId: ctx.org.id,
    connectionId,
    status: "importing",
    detail: "Importing your history. You can leave this page.",
    actorMemberId: ctx.member.id,
    action: "connection.import_started",
  });
  if (row.connector_key === "gohighlevel") {
    const db = (await createClient()) as unknown as SupabaseClient;
    await db.rpc("onboarding_import_start", { p_org_id: ctx.org.id, p_lookback_days: 90 });
  } else {
    await setConnectionStatus({
      orgId: ctx.org.id,
      connectionId,
      status: "live",
      detail: null,
      actorMemberId: ctx.member.id,
      action: "connection.live",
    });
    const { notifyOwnersHistory } = await import("@/lib/connectors/maintain");
    await notifyOwnersHistory(ctx.org.id, connectorByKey(row.connector_key)?.name ?? "your tool");
  }
  redirect(`/app/settings/connections/view/${connectionId}`);
}

export async function pauseAction(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const id = String(formData.get("connection") ?? "");
  await pauseConnection(ctx.org.id, id, ctx.member.id);
  refresh(`/app/settings/connections/view/${id}`);
}

export async function resumeAction(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const id = String(formData.get("connection") ?? "");
  await resumeConnection(ctx.org.id, id, ctx.member.id);
  refresh(`/app/settings/connections/view/${id}`);
}

export async function disconnectAction(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const id = String(formData.get("connection") ?? "");
  const row = await loadConnection(ctx.org.id, id);
  if (!row) return;
  const tool = connectorByKey(row.connector_key)?.name ?? "this tool";
  await disconnectConnection({
    orgId: ctx.org.id,
    connectionId: id,
    actorMemberId: ctx.member.id,
    detail: `Disconnected by the workspace.`,
  });
  if (formData.get("delete_data") === "on") {
    const db = (await createClient()) as unknown as SupabaseClient;
    await db.rpc("data_request_create", {
      p_org_id: ctx.org.id,
      p_kind: "deletion",
      p_note: `Delete data that came from ${tool}.`,
    });
  }
  redirect("/app/settings/connections");
}

export async function rotateSecretAction(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const id = String(formData.get("connection") ?? "");
  const secret = await rotateWebhookSecret(id, ctx.org.id, ctx.member.id);
  const jar = await cookies();
  jar.set("vistrial_hook_secret_once", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 120,
    path: "/app/settings/connections",
    sameSite: "lax",
  });
  redirect(`/app/settings/connections/view/${id}?rotated=1`);
}

export async function uploadSheet(formData: FormData): Promise<void> {
  const ctx = await requireConnectionViewer();
  if (!managesConnections(ctx)) return;
  const file = formData.get("file");
  const text = typeof file === "string" ? file : file instanceof File ? await file.text() : "";
  if (!text.trim()) return;
  const mode = String(formData.get("mode") ?? "past") === "active" ? "active" : "past";
  const activeAllowed = false;
  const sheet = parseCsv(text);
  const matches = suggestColumns(sheet.headers);
  const hash = hashSheet(sheet);
  if (await fileAlreadyImported(ctx.org.id, hash)) {
    redirect("/app/settings/connections/file_upload?error=already");
  }
  const existing = await listConnections(ctx.org.id);
  const connection = existing.find((row) => row.connector_key === "file_upload" && row.status !== "disconnected");
  const plan = planRows({ sheet, matches, existingKeys: new Set(), mode, activeAllowed });
  const rejected = plan.rows.filter((row) => row.action === "reject");
  if (mode === "active") {
    redirect("/app/settings/connections/file_upload?error=active_off");
  }
  await saveFileImport({
    orgId: ctx.org.id,
    connectionId: connection?.id ?? null,
    fileHash: hash,
    recordKind: String(formData.get("record_kind") ?? "people"),
    mode: "past",
    created: plan.rows.filter((row) => row.action === "create").length,
    updated: plan.rows.filter((row) => row.action === "update").length,
    skipped: plan.rows.filter((row) => row.action === "skip").length,
    rejected: rejected.length,
    errorReport: rejected.map((row) => `Row ${row.index}: ${row.reason}`).join("\n"),
    rawBody: text.slice(0, 500_000),
    actorId: ctx.member.id,
  });
  redirect("/app/settings/connections/file_upload?imported=1");
}

export async function templateCsv(): Promise<string> {
  await requireConnectionViewer();
  return TEMPLATE_CSV;
}

export async function sendConnectLink(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!canPrepareConnectLink({ isStaff: ctx.isStaff })) return;
  const key = String(formData.get("connector") ?? "");
  if (!connectorByKey(key)) return;
  const token = await createConnectInvite({ orgId: ctx.org.id, connectorKey: key, actorId: ctx.user.id });
  redirect(`/app/settings/connections/${key}?invite=${encodeURIComponent(`${appUrl()}/app/settings/connections/${key}?invite_token=${token}`)}`);
}

export async function enableConnector(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return;
  const orgId = String(formData.get("org_id") ?? "");
  const key = String(formData.get("connector") ?? "");
  const enabled = formData.get("enabled") === "on";
  if (!orgId || !connectorByKey(key)) return;
  await setConnectorAccess({ orgId, connectorKey: key, enabled, actorId: ctx.user.id });
  refresh("/app/team/connectors");
}

export async function shareAccount(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 8) return;
  await allowSharedAccount({
    connectorKey: String(formData.get("connector") ?? ""),
    externalAccountId: String(formData.get("external") ?? "").trim(),
    orgId: String(formData.get("org_id") ?? ""),
    otherOrgId: String(formData.get("other_org_id") ?? ""),
    reason,
    actorId: ctx.user.id,
  });
  refresh("/app/team/connectors");
}
