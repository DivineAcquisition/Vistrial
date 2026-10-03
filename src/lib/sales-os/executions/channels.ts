import "server-only";

import { discordPayload, slackPayload, type StructuredUpdate } from "@/lib/sales-os/executions/format";
import { externalPost } from "@/lib/sales-os/executions/http";

const SLACK_PATH = /^\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/;
const DISCORD_PATH = /^\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]+$/;

/**
 * A Slack posting link is an incoming-webhook URL scoped to one channel. It
 * can post there and nothing else: no reading, no editing, no deleting.
 */
export function isSlackPostingLink(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && url.hostname === "hooks.slack.com" && SLACK_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

/** A Discord posting link is a channel webhook URL. It posts to one channel. */
export function isDiscordPostingLink(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return (
      url.protocol === "https:" &&
      (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
      DISCORD_PATH.test(url.pathname) &&
      !url.search
    );
  } catch {
    return false;
  }
}

export type PostResult = { ok: true; summary: string; reference: string | null } | { ok: false; error: string };

export async function postToSlack(link: string, channelLabel: string, update: StructuredUpdate, footer: string): Promise<PostResult> {
  if (!isSlackPostingLink(link)) return { ok: false, error: "The saved Slack link isn't a channel posting link." };
  const res = await externalPost(link, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(slackPayload(update, footer)),
  });
  if (!res.ok || res.text.trim() !== "ok") {
    const reason = res.text.trim().slice(0, 120) || `status ${res.status}`;
    return { ok: false, error: `Slack didn't accept the post (${reason}). Nothing was retried.` };
  }
  return { ok: true, summary: `Posted in ${channelLabel} on Slack.`, reference: null };
}

export async function postToDiscord(link: string, channelLabel: string, update: StructuredUpdate, footer: string): Promise<PostResult> {
  if (!isDiscordPostingLink(link)) return { ok: false, error: "The saved Discord link isn't a channel posting link." };
  const res = await externalPost(`${link.trim()}?wait=true`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(discordPayload(update, footer)),
  });
  if (!res.ok) {
    return { ok: false, error: `Discord didn't accept the post (status ${res.status}). Nothing was retried.` };
  }
  const id = res.json && typeof res.json === "object" ? (res.json as { id?: unknown }).id : null;
  return { ok: true, summary: `Posted in ${channelLabel} on Discord.`, reference: typeof id === "string" ? id : null };
}
