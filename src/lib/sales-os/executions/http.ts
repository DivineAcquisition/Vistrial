import "server-only";

/**
 * The only way Sales OS code reaches outside Vistrial. POST only, to a fixed
 * list of hosts, never retried. There is no DELETE, PUT, or PATCH here, so
 * nothing in Slack, Discord, or Drive can be changed or removed through it.
 */
export const EXTERNAL_HOSTS = [
  "hooks.slack.com",
  "discord.com",
  "discordapp.com",
  "www.googleapis.com",
  "oauth2.googleapis.com",
] as const;

const TIMEOUT_MS = 15_000;

export class ExternalRefused extends Error {}

export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExternalRefused("That address isn't a valid link.");
  }
  if (url.protocol !== "https:") throw new ExternalRefused("Only secure links are allowed.");
  if (!(EXTERNAL_HOSTS as readonly string[]).includes(url.hostname)) {
    throw new ExternalRefused("Vistrial only posts to Slack, Discord, and Google Drive.");
  }
  return url;
}

export type ExternalResponse = { ok: boolean; status: number; text: string; json: unknown };

export async function externalPost(
  rawUrl: string,
  init: { headers?: Record<string, string>; body: string | URLSearchParams | FormData | Blob }
): Promise<ExternalResponse> {
  const url = assertAllowedUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Drive lookups (does our folder exist?) need a GET. Same host list, read-only. */
export async function externalGet(rawUrl: string, headers: Record<string, string>): Promise<ExternalResponse> {
  const url = assertAllowedUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, redirect: "error", cache: "no-store", signal: controller.signal });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}
