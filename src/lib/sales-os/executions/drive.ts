import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { appUrl } from "@/lib/app-url";
import { getTokenEncryptionKey } from "@/lib/ghl/crypto";
import { externalGet, externalPost } from "@/lib/sales-os/executions/http";

/**
 * drive.file: Vistrial can see and create only the files it made itself. It
 * cannot list, open, change, or remove anything else in the client's Drive.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_ROOT_FOLDER = "Vistrial";
export const DRIVE_STATE_COOKIE = "vistrial_drive_oauth";
const STATE_TTL_MS = 10 * 60_000;

export function driveConfigured(env = process.env): boolean {
  return Boolean(env.GOOGLE_DRIVE_CLIENT_ID?.trim() && env.GOOGLE_DRIVE_CLIENT_SECRET?.trim());
}

function clientId(): string {
  return process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() ?? "";
}

function clientSecret(): string {
  return process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() ?? "";
}

export function driveRedirectUri(): string {
  return `${appUrl()}/api/sales-os/drive/callback`;
}

type DriveState = { orgId: string; memberId: string; nonce: string; exp: number };

function sign(payload: string): string {
  return createHmac("sha256", getTokenEncryptionKey()).update(`drive:${payload}`).digest("base64url");
}

export function createDriveState(orgId: string, memberId: string): string {
  const state: DriveState = { orgId, memberId, nonce: randomBytes(16).toString("hex"), exp: Date.now() + STATE_TTL_MS };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseDriveState(value: string): DriveState | null {
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DriveState;
    if (!parsed.orgId || !parsed.memberId || !parsed.nonce || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function driveConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: driveRedirectUri(),
    response_type: "code",
    scope: `${DRIVE_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export async function exchangeDriveCode(code: string): Promise<{ refreshToken: string; accessToken: string; email: string | null }> {
  const res = await externalPost("https://oauth2.googleapis.com/token", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: driveRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const json = (res.json ?? {}) as { refresh_token?: string; access_token?: string; id_token?: string; scope?: string };
  if (!res.ok || !json.refresh_token || !json.access_token) {
    throw new Error("Google didn't finish the Drive connection. Try again.");
  }
  if (json.scope && /\/auth\/drive(\s|$)/.test(json.scope)) {
    throw new Error("Google granted full Drive access. Vistrial only accepts access to the files it creates.");
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token, email: emailFromIdToken(json.id_token) };
}

export async function driveAccessToken(refreshToken: string): Promise<string> {
  const res = await externalPost("https://oauth2.googleapis.com/token", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const token = (res.json as { access_token?: string } | null)?.access_token;
  if (!res.ok || !token) throw new Error("Google Drive needs to be reconnected in Settings.");
  return token;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function createDriveFolder(accessToken: string, name: string, parentId: string | null): Promise<string> {
  const res = await externalPost("https://www.googleapis.com/drive/v3/files?fields=id", {
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  const id = (res.json as { id?: string } | null)?.id;
  if (!res.ok || !id) throw new Error(`Google Drive didn't create the "${name}" folder.`);
  return id;
}

/** Find a folder Vistrial created earlier, or create it. Never moves, renames, or removes anything. */
export async function ensureDriveFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const res = await externalGet(
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", spaces: "drive" })}`,
    { authorization: `Bearer ${accessToken}` }
  );
  const existing = (res.json as { files?: Array<{ id?: string }> } | null)?.files?.[0]?.id;
  if (res.ok && existing) return existing;
  return createDriveFolder(accessToken, name, parentId);
}

export type DriveFile = { id: string; link: string | null };

/** Uploads a new Google Doc. A new version is a new file; an existing file is never overwritten. */
export async function createDriveDoc(accessToken: string, args: { name: string; parentId: string; html: string }): Promise<DriveFile> {
  const boundary = `vistrial${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({ name: args.name, mimeType: "application/vnd.google-apps.document", parents: [args.parentId] });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    args.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await externalPost("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    headers: { authorization: `Bearer ${accessToken}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = res.json as { id?: string; webViewLink?: string } | null;
  if (!res.ok || !json?.id) throw new Error(`Google Drive didn't accept the file (status ${res.status}). Nothing was retried.`);
  return { id: json.id, link: json.webViewLink ?? null };
}
