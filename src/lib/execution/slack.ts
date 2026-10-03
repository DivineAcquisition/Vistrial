import "server-only";

import { slackClientId, slackClientSecret, executionOAuthRedirectUri } from "@/lib/execution/env";
import { ProviderError } from "@/lib/execution/errors";
import { asRecord, asString, clip, providerFetch, readJson } from "@/lib/execution/http";
import { SLACK_BOT_SCOPES } from "@/lib/execution/kinds";
import { normalizeMessage, type StructuredMessage } from "@/lib/execution/message";

const SLACK_API = "https://slack.com/api";

export type SlackChannel = { id: string; name: string; isMember: boolean };

/**
 * Bot scopes only: post, list public channels, and join one. There is no
 * history, direct-message, reaction, or user scope, so the token could not do
 * those things even if code asked it to.
 */
export function slackAuthorizeUrl(state: string): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", slackClientId());
  url.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
  url.searchParams.set("redirect_uri", executionOAuthRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

/** Turns Slack's error codes into words a person can act on. */
export function slackError(code: string | null): ProviderError {
  switch (code) {
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
    case "token_expired":
    case "account_inactive":
    case "missing_scope":
      return new ProviderError("Slack access was removed or changed. Reconnect Slack to keep posting.", "auth");
    case "channel_not_found":
    case "is_archived":
    case "not_in_channel":
    case "restricted_action":
      return new ProviderError(
        "The Slack channel Vistrial posts to is gone, archived, or closed to it. Choose another channel.",
        "destination"
      );
    case "ratelimited":
    case "rate_limited":
    case "service_unavailable":
    case "internal_error":
    case "fatal_error":
      return new ProviderError("Slack is busy right now. Try again in a minute.", "transient");
    default:
      return new ProviderError("Slack did not accept that post.", "rejected");
  }
}

async function slackCall(
  token: string,
  method: string,
  body: Record<string, unknown> | URLSearchParams,
  asJson = true
): Promise<Record<string, unknown>> {
  const res = await providerFetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": asJson ? "application/json; charset=utf-8" : "application/x-www-form-urlencoded",
    },
    body: body instanceof URLSearchParams ? body : JSON.stringify(body),
  });
  if (res.status === 429) throw slackError("ratelimited");
  const json = await readJson(res);
  if (json.ok !== true) throw slackError(asString(json.error));
  return json;
}

export type SlackInstall = { token: string; teamId: string; teamName: string };

/**
 * Exchanges the code for the workspace's own bot token. Refuses a grant that
 * carries any scope beyond the three requested.
 */
export async function slackExchangeCode(code: string): Promise<SlackInstall> {
  const res = await providerFetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: slackClientId(),
      client_secret: slackClientSecret(),
      code,
      redirect_uri: executionOAuthRedirectUri(),
    }),
  });
  const json = await readJson(res);
  const token = asString(json.access_token);
  const team = asRecord(json.team);
  if (json.ok !== true || !token || asString(json.token_type) !== "bot") {
    throw new ProviderError("Could not finish connecting Slack. Start again from Settings.", "rejected");
  }
  const granted = (asString(json.scope) ?? "").split(",").filter(Boolean);
  const allowed = new Set<string>(SLACK_BOT_SCOPES);
  if (granted.length === 0 || granted.some((scope) => !allowed.has(scope))) {
    await slackRevoke(token);
    throw new ProviderError("Slack granted more access than Vistrial asks for, so it was not connected.", "rejected");
  }
  return {
    token,
    teamId: asString(team?.id) ?? "",
    teamName: asString(team?.name) ?? "Slack workspace",
  };
}

/** The workspace's public channels, live. Private channels are not offered. */
export async function slackListChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${SLACK_API}/conversations.list`);
    url.searchParams.set("types", "public_channel");
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await providerFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) throw slackError("ratelimited");
    const json = await readJson(res);
    if (json.ok !== true) throw slackError(asString(json.error));
    for (const raw of Array.isArray(json.channels) ? json.channels : []) {
      const channel = asRecord(raw);
      const id = asString(channel?.id);
      const name = asString(channel?.name);
      if (id && name) channels.push({ id, name, isMember: channel?.is_member === true });
    }
    cursor = asString(asRecord(json.response_metadata)?.next_cursor) ?? "";
    if (!cursor) break;
  }
  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

/** Joins a public channel the bot is not in yet. This is what `channels:join` is for. */
export async function slackJoinChannel(token: string, channelId: string): Promise<void> {
  await slackCall(token, "conversations.join", { channel: channelId });
}

/** Slack control characters. Escaping `<` also stops @channel and user mentions. */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackBlocks(message: StructuredMessage): unknown[] {
  const normal = normalizeMessage(message);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: clip(normal.title, 150), emoji: false } },
  ];
  if (normal.summary) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(escapeSlack(normal.summary), 3000) } });
  }
  if (normal.fields?.length) {
    blocks.push({
      type: "section",
      fields: normal.fields.map((field) => ({
        type: "mrkdwn",
        text: clip(`*${escapeSlack(field.label)}*\n${escapeSlack(field.value)}`, 2000),
      })),
    });
  }
  if (normal.footer) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: clip(escapeSlack(normal.footer), 3000) }] });
  }
  return blocks;
}

/**
 * Posts one structured message to the channel the client picked. The channel
 * comes from the stored connection, never from the caller.
 */
export async function slackPostMessage(
  token: string,
  channelId: string,
  message: StructuredMessage
): Promise<{ ts: string }> {
  const normal = normalizeMessage(message);
  const json = await slackCall(token, "chat.postMessage", {
    channel: channelId,
    text: clip(normal.title, 300),
    blocks: slackBlocks(normal),
    unfurl_links: false,
    unfurl_media: false,
  });
  return { ts: asString(json.ts) ?? "" };
}

/** Ends Vistrial's grant. Deletes no message. Best effort: a failure here changes nothing locally. */
export async function slackRevoke(token: string): Promise<void> {
  try {
    await providerFetch(`${SLACK_API}/auth.revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* the local tokens are already gone */
  }
}
