import "server-only";

import {
  discordBotToken,
  discordClientId,
  discordClientSecret,
  executionOAuthRedirectUri,
} from "@/lib/execution/env";
import { ProviderError } from "@/lib/execution/errors";
import { asRecord, asString, clip, providerFetch, readJson } from "@/lib/execution/http";
import { DISCORD_PERMISSIONS } from "@/lib/execution/kinds";
import { normalizeMessage, type StructuredMessage } from "@/lib/execution/message";

const DISCORD_API = "https://discord.com/api/v10";
/** A regular text channel. Voice, forum, and announcement channels are not offered. */
const GUILD_TEXT = 0;

export type DiscordChannel = { id: string; name: string };

/**
 * The bot-invite flow. `permissions` is exactly View Channels plus Send
 * Messages (3072): not Administrator, not Manage anything, not a broad default.
 */
export function discordAuthorizeUrl(state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", discordClientId());
  url.searchParams.set("scope", "bot");
  url.searchParams.set("permissions", String(DISCORD_PERMISSIONS));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", executionOAuthRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

function botHeaders(): Record<string, string> {
  return { Authorization: `Bot ${discordBotToken()}`, "Content-Type": "application/json" };
}

export function discordError(status: number, code: number | null): ProviderError {
  if (status === 401) {
    return new ProviderError("Vistrial's Discord bot could not sign in. This is on our side; we have been told.", "auth");
  }
  if (status === 429 || status >= 500) {
    return new ProviderError("Discord is busy right now. Try again in a minute.", "transient");
  }
  // 10004 unknown guild: the bot was removed from the server.
  if (code === 10004 || (status === 404 && code === null)) {
    return new ProviderError("Vistrial's bot is no longer in your Discord server. Reconnect Discord.", "auth");
  }
  // 10003 unknown channel, 50001 missing access, 50013 missing permissions.
  if (status === 403 || status === 404 || code === 10003 || code === 50001 || code === 50013) {
    return new ProviderError(
      "Vistrial's bot can no longer see or post in that Discord channel. Check the bot's access to it, or choose another channel.",
      "destination"
    );
  }
  return new ProviderError("Discord did not accept that post.", "rejected");
}

async function discordRequest(path: string, init: RequestInit = {}): Promise<Record<string, unknown> | unknown[]> {
  if (!discordBotToken()) throw new ProviderError("Discord is not set up on this deployment yet.", "unconfigured");
  const res = await providerFetch(`${DISCORD_API}${path}`, { ...init, headers: { ...botHeaders(), ...init.headers } });
  if (res.status === 204) return {};
  const parsed: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const record = asRecord(parsed);
    throw discordError(res.status, typeof record?.code === "number" ? record.code : null);
  }
  return (Array.isArray(parsed) ? parsed : (asRecord(parsed) ?? {})) as Record<string, unknown> | unknown[];
}

export type DiscordInstall = { guildId: string; guildName: string };

/**
 * Finishes the invite. Discord returns the server the bot was added to; the
 * user token it also returns is never stored. The bot's presence in that
 * server is confirmed before anything is saved.
 */
export async function discordExchangeCode(code: string): Promise<DiscordInstall> {
  const res = await providerFetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: discordClientId(),
      client_secret: discordClientSecret(),
      grant_type: "authorization_code",
      code,
      redirect_uri: executionOAuthRedirectUri(),
    }),
  });
  const json = await readJson(res);
  const guild = asRecord(json.guild);
  const guildId = asString(guild?.id);
  if (!res.ok || !guildId) {
    throw new ProviderError("Could not finish connecting Discord. Start again from Settings.", "rejected");
  }
  await discordListChannels(guildId);
  return { guildId, guildName: asString(guild?.name) ?? "Discord server" };
}

/** Text channels in the server, live, in the order the server shows them. */
export async function discordListChannels(guildId: string): Promise<DiscordChannel[]> {
  const result = await discordRequest(`/guilds/${encodeURIComponent(guildId)}/channels`);
  const rows = Array.isArray(result) ? result : [];
  return rows
    .map((raw) => asRecord(raw))
    .filter((channel): channel is Record<string, unknown> => channel !== null && channel.type === GUILD_TEXT)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .flatMap((channel) => {
      const id = asString(channel.id);
      const name = asString(channel.name);
      return id && name ? [{ id, name }] : [];
    });
}

export function discordEmbed(message: StructuredMessage): Record<string, unknown> {
  const normal = normalizeMessage(message);
  return {
    title: clip(normal.title, 256),
    ...(normal.summary ? { description: clip(normal.summary, 4000) } : {}),
    ...(normal.fields?.length
      ? {
          fields: normal.fields.slice(0, 25).map((field) => ({
            name: clip(field.label, 256),
            value: clip(field.value, 1024),
            inline: true,
          })),
        }
      : {}),
    ...(normal.footer ? { footer: { text: clip(normal.footer, 2000) } } : {}),
    color: 0x9a88fc,
  };
}

/**
 * Posts one embed to the channel the client picked. Mentions are switched off,
 * so a post can never ping @everyone, a role, or a person.
 */
export async function discordPostMessage(
  channelId: string,
  message: StructuredMessage
): Promise<{ id: string }> {
  const result = await discordRequest(`/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [discordEmbed(message)], allowed_mentions: { parse: [] } }),
  });
  return { id: asString(asRecord(result)?.id) ?? "" };
}

/** Confirms a channel belongs to the connected server before it is saved. */
export async function discordChannelInGuild(guildId: string, channelId: string): Promise<DiscordChannel | null> {
  return (await discordListChannels(guildId)).find((channel) => channel.id === channelId) ?? null;
}

/**
 * Removes the bot from the server, which is the only way to take its posting
 * ability away. Leaving deletes nothing already posted. Best effort.
 */
export async function discordLeaveGuild(guildId: string): Promise<void> {
  try {
    await discordRequest(`/users/@me/guilds/${encodeURIComponent(guildId)}`, { method: "DELETE" });
  } catch {
    /* the local connection is already cleared; the bot can also be removed in Discord */
  }
}
