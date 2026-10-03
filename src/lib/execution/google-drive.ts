import "server-only";

import { loadConnection, markBroken, saveAccessToken } from "@/lib/execution/connections";
import {
  executionOAuthRedirectUri,
  googleDriveClientId,
  googleDriveClientSecret,
} from "@/lib/execution/env";
import { ProviderError } from "@/lib/execution/errors";
import { asRecord, asString, providerFetch, readJson } from "@/lib/execution/http";
import { GOOGLE_DRIVE_SCOPE } from "@/lib/execution/kinds";
import type { GhlDb } from "@/lib/ghl/tokens";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const REFRESH_MARGIN_MS = 60_000;

/**
 * `drive.file` and nothing else: access to files and folders this app creates
 * or the client explicitly picks. The broader `drive` scope is never requested
 * and a grant that carries it is refused.
 */
export function driveAuthorizeUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleDriveClientId());
  url.searchParams.set("redirect_uri", executionOAuthRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

export function driveError(status: number, reason: string | null): ProviderError {
  if (status === 401 || reason === "authError" || reason === "invalid_grant") {
    return new ProviderError("Google Drive access was removed. Reconnect Drive to keep filing.", "auth");
  }
  if (status === 404 || reason === "notFound" || reason === "insufficientFilePermissions") {
    return new ProviderError(
      "Vistrial can no longer reach the Drive folder it files into. Choose the folder again.",
      "destination"
    );
  }
  if (status === 403 && (reason === "storageQuotaExceeded" || reason === "quotaExceeded")) {
    return new ProviderError("Your Google Drive is full, so nothing more can be filed.", "rejected");
  }
  if (status === 429 || status >= 500 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new ProviderError("Google Drive is busy right now. Try again in a minute.", "transient");
  }
  return new ProviderError("Google Drive did not accept that file.", "rejected");
}

async function driveJson(token: string, url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await providerFetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  const json = await readJson(res);
  if (!res.ok) {
    const error = asRecord(json.error);
    const first = Array.isArray(error?.errors) ? asRecord(error.errors[0]) : null;
    throw driveError(res.status, asString(first?.reason));
  }
  return json;
}

export type DriveGrant = { accessToken: string; refreshToken: string; expiresAt: string };

export async function driveExchangeCode(code: string): Promise<DriveGrant> {
  const res = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleDriveClientId(),
      client_secret: googleDriveClientSecret(),
      redirect_uri: executionOAuthRedirectUri(),
      grant_type: "authorization_code",
      code,
    }),
  });
  const json = await readJson(res);
  const accessToken = asString(json.access_token);
  const refreshToken = asString(json.refresh_token);
  if (!res.ok || !accessToken || !refreshToken) {
    throw new ProviderError("Could not finish connecting Google Drive. Start again from Settings.", "rejected");
  }
  const scopes = (asString(json.scope) ?? "").split(" ").filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== GOOGLE_DRIVE_SCOPE) {
    await driveRevoke(refreshToken);
    throw new ProviderError(
      "Google granted more access than Vistrial asks for, so Drive was not connected.",
      "rejected"
    );
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return { accessToken, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

/** A usable access token, refreshed when it is about to lapse. */
export async function driveAccessToken(db: GhlDb, orgId: string): Promise<string> {
  const connection = await loadConnection(db, orgId, "google_drive");
  if (!connection || connection.status === "inactive") {
    throw new ProviderError("Google Drive is not connected.", "auth");
  }
  const fresh =
    connection.secret &&
    connection.expiresAt &&
    Date.parse(connection.expiresAt) - Date.now() > REFRESH_MARGIN_MS;
  if (fresh && connection.secret) return connection.secret;
  if (!connection.refresh) {
    const error = driveError(401, "authError");
    await markBroken(db, orgId, "google_drive", error.message);
    throw error;
  }
  const res = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleDriveClientId(),
      client_secret: googleDriveClientSecret(),
      grant_type: "refresh_token",
      refresh_token: connection.refresh,
    }),
  });
  const json = await readJson(res);
  const accessToken = asString(json.access_token);
  if (!res.ok || !accessToken) {
    if (res.status >= 500 || res.status === 429) {
      throw new ProviderError("Google Drive is busy right now. Try again in a minute.", "transient");
    }
    const error = driveError(401, "invalid_grant");
    await markBroken(db, orgId, "google_drive", error.message);
    throw error;
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  await saveAccessToken(db, orgId, "google_drive", {
    secret: accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });
  return accessToken;
}

export type DriveFolder = { id: string; name: string };

/** Creates a folder in the client's My Drive. `drive.file` allows it: the app made it. */
export async function driveCreateRootFolder(token: string, name = "Vistrial"): Promise<DriveFolder> {
  const json = await driveJson(token, `${DRIVE_API}/files?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  const id = asString(json.id);
  if (!id) throw new ProviderError("Google Drive did not create the folder.", "rejected");
  return { id, name: asString(json.name) ?? name };
}

/**
 * Confirms a folder the client picked is a real, usable, untrashed folder the
 * app can add to. A folder the picker did not grant comes back not found.
 */
export async function driveVerifyFolder(token: string, folderId: string): Promise<DriveFolder> {
  const json = await driveJson(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)`
  );
  const capabilities = asRecord(json.capabilities);
  if (
    json.mimeType !== FOLDER_MIME ||
    json.trashed === true ||
    capabilities?.canAddChildren === false
  ) {
    throw new ProviderError("That is not a folder Vistrial can file into. Choose another.", "destination");
  }
  const id = asString(json.id);
  if (!id) throw new ProviderError("Vistrial can no longer reach that folder. Choose it again.", "destination");
  return { id, name: asString(json.name) ?? "Drive folder" };
}

/** A folder or file name that cannot climb out of its parent or confuse a query. */
export function sanitizeSegment(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const safe = /^\.+$/.test(cleaned) ? "-" : cleaned;
  return (safe || "Untitled").slice(0, 100);
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Walks from the stored root, creating each subfolder that is missing, and
 * returns the last one's id. Every parent id used for a write comes from this
 * chain, which starts at the root the client picked, so there is no way to
 * name a folder elsewhere in their Drive.
 */
export async function driveEnsureFolderPath(token: string, rootId: string, segments: string[]): Promise<string> {
  let parent = rootId;
  for (const raw of segments) {
    const name = sanitizeSegment(raw);
    const q = `'${escapeQuery(parent)}' in parents and name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const found = await driveJson(
      token,
      `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&spaces=drive`
    );
    const existing = Array.isArray(found.files) ? asString(asRecord(found.files[0])?.id) : null;
    if (existing) {
      parent = existing;
      continue;
    }
    const created = await driveJson(token, `${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
    });
    const id = asString(created.id);
    if (!id) throw new ProviderError("Google Drive did not create the folder.", "rejected");
    parent = id;
  }
  return parent;
}

export type DriveFile = { id: string; name: string; link: string | null };

export async function driveUploadFile(
  token: string,
  parentId: string,
  fileName: string,
  content: string | Uint8Array,
  mimeType = "text/plain"
): Promise<DriveFile> {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  if (bytes.length === 0) throw new ProviderError("There is nothing to file.", "rejected");
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new ProviderError("That file is too large to file in Drive from here.", "rejected");
  }
  const name = sanitizeSegment(fileName);
  const boundary = `vistrial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
        name,
        parents: [parentId],
      })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8"
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`, "utf8"),
  ]);
  const json = await driveJson(token, `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const id = asString(json.id);
  if (!id) throw new ProviderError("Google Drive did not accept that file.", "rejected");
  return { id, name: asString(json.name) ?? name, link: asString(json.webViewLink) };
}

/** Ends Vistrial's grant. Deletes no file. Best effort. */
export async function driveRevoke(token: string): Promise<void> {
  try {
    await providerFetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    /* the local tokens are already gone */
  }
}
