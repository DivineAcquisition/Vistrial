"use server";

import { revalidatePath } from "next/cache";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  clearConnection,
  loadConnection,
  markBroken,
  saveDestination,
} from "@/lib/execution/connections";
import { discordChannelInGuild, discordLeaveGuild, discordListChannels } from "@/lib/execution/discord";
import {
  googleCloudProjectNumber,
  googleDriveConfigured,
  googlePickerApiKey,
} from "@/lib/execution/env";
import { ProviderError, plainErrorMessage } from "@/lib/execution/errors";
import {
  driveAccessToken,
  driveCreateRootFolder,
  driveRevoke,
  driveVerifyFolder,
} from "@/lib/execution/google-drive";
import { isExecutionKind, type ExecutionKind } from "@/lib/execution/kinds";
import { sendConnectionTest } from "@/lib/execution/operations";
import { slackJoinChannel, slackListChannels, slackRevoke } from "@/lib/execution/slack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type Choice = { id: string; label: string };
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PAGE = "/app/settings/integrations";

async function manager(): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  return canManageOrgSettings(ctx.role, ctx.isPlatformAdmin) ? ctx : null;
}

const DENIED = { ok: false, error: "Only an owner or admin can change this." } as const;

async function fail(ctx: AuthContext, kind: ExecutionKind, error: unknown): Promise<{ ok: false; error: string }> {
  const message = plainErrorMessage(error, "Something went wrong. Nothing was changed.");
  if (error instanceof ProviderError && error.code === "auth") {
    await markBroken(getSupabaseAdmin(), ctx.org.id, kind, message);
    revalidatePath(PAGE);
  }
  return { ok: false, error: message };
}

/** The live list the client picks from. Pulled from their workspace or server each time it is asked for. */
export async function listDestinationChoices(kind: string): Promise<ActionResult<{ choices: Choice[] }>> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  if (!isExecutionKind(kind) || kind === "google_drive") return { ok: false, error: "That has no channel list." };
  const db = getSupabaseAdmin();
  const connection = await loadConnection(db, ctx.org.id, kind);
  if (!connection || connection.status === "inactive") return { ok: false, error: "Connect it first." };
  try {
    if (kind === "slack") {
      if (!connection.secret) throw new ProviderError("Slack needs to be reconnected.", "auth");
      const channels = await slackListChannels(connection.secret);
      return { ok: true, choices: channels.map((channel) => ({ id: channel.id, label: `#${channel.name}` })) };
    }
    if (!connection.externalAccountId) throw new ProviderError("Reconnect Discord.", "auth");
    const channels = await discordListChannels(connection.externalAccountId);
    return { ok: true, choices: channels.map((channel) => ({ id: channel.id, label: `#${channel.name}` })) };
  } catch (error) {
    return fail(ctx, kind, error);
  }
}

/**
 * Saves the channel the client picked. The id is checked against the live
 * list first, so a made-up or foreign id cannot be stored.
 */
export async function chooseChannel(kind: string, channelId: string): Promise<ActionResult> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  if (kind !== "slack" && kind !== "discord") return { ok: false, error: "That has no channel list." };
  const db = getSupabaseAdmin();
  const connection = await loadConnection(db, ctx.org.id, kind);
  if (!connection || connection.status === "inactive") return { ok: false, error: "Connect it first." };
  try {
    if (kind === "slack") {
      if (!connection.secret) throw new ProviderError("Slack needs to be reconnected.", "auth");
      const channel = (await slackListChannels(connection.secret)).find((candidate) => candidate.id === channelId);
      if (!channel) return { ok: false, error: "That channel is not in your Slack workspace anymore. Pick from the list." };
      // The bot can only post where it is a member; channels:join is for exactly this.
      if (!channel.isMember) await slackJoinChannel(connection.secret, channel.id);
      await saveDestination(db, ctx.org.id, kind, { id: channel.id, label: `#${channel.name}` });
    } else {
      if (!connection.externalAccountId) throw new ProviderError("Reconnect Discord.", "auth");
      const channel = await discordChannelInGuild(connection.externalAccountId, channelId);
      if (!channel) return { ok: false, error: "That channel is not in your Discord server anymore. Pick from the list." };
      await saveDestination(db, ctx.org.id, kind, { id: channel.id, label: `#${channel.name}` });
    }
    revalidatePath(PAGE);
    return { ok: true };
  } catch (error) {
    return fail(ctx, kind, error);
  }
}

/** What Google's picker needs in the browser. The token is short-lived and drive.file only. */
export async function getDrivePickerConfig(): Promise<
  ActionResult<{ accessToken: string; apiKey: string; appId: string }>
> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  if (!googleDriveConfigured()) return { ok: false, error: "Google Drive is not set up on this deployment yet." };
  try {
    const accessToken = await driveAccessToken(getSupabaseAdmin(), ctx.org.id);
    return { ok: true, accessToken, apiKey: googlePickerApiKey(), appId: googleCloudProjectNumber() };
  } catch (error) {
    return fail(ctx, "google_drive", error);
  }
}

/** Saves the folder the client picked in Google's picker, after confirming it really is a folder. */
export async function chooseDriveFolder(folderId: string): Promise<ActionResult> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  if (typeof folderId !== "string" || !/^[A-Za-z0-9_-]{10,100}$/.test(folderId)) {
    return { ok: false, error: "Choose a folder in the Google window." };
  }
  const db = getSupabaseAdmin();
  try {
    const token = await driveAccessToken(db, ctx.org.id);
    const folder = await driveVerifyFolder(token, folderId);
    await saveDestination(db, ctx.org.id, "google_drive", { id: folder.id, label: folder.name });
    revalidatePath(PAGE);
    return { ok: true };
  } catch (error) {
    return fail(ctx, "google_drive", error);
  }
}

/** Google's picker cannot make a folder, so this one is made through the API, in My Drive. */
export async function createDriveFolder(): Promise<ActionResult> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  const db = getSupabaseAdmin();
  try {
    const token = await driveAccessToken(db, ctx.org.id);
    const folder = await driveCreateRootFolder(token, "Vistrial");
    await saveDestination(db, ctx.org.id, "google_drive", { id: folder.id, label: folder.name });
    revalidatePath(PAGE);
    return { ok: true };
  } catch (error) {
    return fail(ctx, "google_drive", error);
  }
}

/** Writes a real test message or file to the chosen destination. The click is the authorisation. */
export async function sendTest(kind: string): Promise<ActionResult> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  if (!isExecutionKind(kind)) return { ok: false, error: "Unknown destination." };
  const result = await sendConnectionTest(getSupabaseAdmin(), { orgId: ctx.org.id, kind, memberId: ctx.member.id });
  revalidatePath(PAGE);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * One click. Writes stop first, by clearing the tokens and the destination;
 * only then is the grant ended at the provider. Nothing already posted or
 * filed is touched.
 */
export async function disconnectDestination(kind: string): Promise<ActionResult> {
  const ctx = await manager();
  if (!ctx) return DENIED;
  if (!isExecutionKind(kind)) return { ok: false, error: "Unknown destination." };
  const db = getSupabaseAdmin();
  const connection = await loadConnection(db, ctx.org.id, kind);
  try {
    await clearConnection(db, ctx.org.id, kind);
  } catch {
    return { ok: false, error: "Could not disconnect. Nothing was changed." };
  }
  revalidatePath(PAGE);
  if (connection) {
    if (kind === "slack" && connection.secret) await slackRevoke(connection.secret);
    if (kind === "discord" && connection.externalAccountId) await discordLeaveGuild(connection.externalAccountId);
    if (kind === "google_drive") {
      const token = connection.refresh ?? connection.secret;
      if (token) await driveRevoke(token);
    }
  }
  return { ok: true };
}
