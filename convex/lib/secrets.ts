/**
 * App-level encryption for third-party credentials at rest (access and refresh tokens, pasted API keys, webhook
 * signing secrets, PKCE verifiers). AES-256-GCM through Web Crypto, which works in Convex queries, mutations and
 * actions alike. docs/rebuild/integrations-setup.md, "Token encryption".
 *
 * - Stored as `enc:v1:<base64 iv>:<base64 ciphertext and tag>`, with a random 12-byte IV for each value.
 * - The key is `TOKEN_ENCRYPTION_KEY`: 32 random bytes, base64. `TOKEN_ENCRYPTION_KEY_PREVIOUS` is tried for
 *   decryption only, so a key can be rotated (set the new key, keep the old as previous, run the migration).
 * - Safe rollout: a value without the `enc:` prefix is plaintext and is read as it is. Without a key, values are
 *   stored as plaintext and a warning (never the value) is logged, so a deploy cannot break live connections
 *   before the key is set.
 * - Nothing here logs, returns or throws a message that contains a value.
 */

export const SEALED_PREFIX = "enc:v1:";

export const SECRET_TEXT = {
  unreadable: "A stored credential could not be decrypted with the configured keys.",
  badKey: "TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.",
  noKey: "TOKEN_ENCRYPTION_KEY is not set: third-party credentials are being stored without encryption.",
} as const;

type Bytes = Uint8Array<ArrayBuffer>;

function fromBase64(text: string): Bytes {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The raw key bytes from an env value, or null when it is not set. A set but malformed key is an error. */
function keyBytes(name: "TOKEN_ENCRYPTION_KEY" | "TOKEN_ENCRYPTION_KEY_PREVIOUS"): Bytes | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  let bytes: Bytes;
  try {
    bytes = fromBase64(raw);
  } catch {
    throw new Error(SECRET_TEXT.badKey);
  }
  if (bytes.length !== 32) throw new Error(SECRET_TEXT.badKey);
  return bytes;
}

async function importKey(bytes: Bytes) {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Whether new credentials are being encrypted on this deployment. */
export function encryptionReady(): boolean {
  return keyBytes("TOKEN_ENCRYPTION_KEY") !== null;
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(SEALED_PREFIX);
}

let warned = false;

/**
 * Encrypts a credential for storage. An already-sealed value is returned unchanged. Without a key it returns the
 * plaintext and logs a warning once per process, never the value.
 */
export async function sealSecret(value: string): Promise<string> {
  if (isSealed(value)) return value;
  const bytes = keyBytes("TOKEN_ENCRYPTION_KEY");
  if (!bytes) {
    if (!warned) {
      warned = true;
      console.warn(SECRET_TEXT.noKey);
    }
    return value;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(bytes), new TextEncoder().encode(value)));
  return `${SEALED_PREFIX}${toBase64(iv)}:${toBase64(sealed)}`;
}

/** `sealSecret` for an optional field: undefined and null stay as they are. */
export async function sealOptional<T extends string | null | undefined>(value: T): Promise<T> {
  return (typeof value === "string" ? await sealSecret(value) : value) as T;
}

/**
 * Reads a stored credential. Plaintext (no `enc:` prefix) is returned as it is. A sealed value is decrypted with
 * the current key, then the previous one. Fails with a message that names no value.
 */
export async function openSecret(value: string): Promise<string> {
  if (!isSealed(value)) return value;
  const parts = value.slice(SEALED_PREFIX.length).split(":");
  if (parts.length !== 2) throw new Error(SECRET_TEXT.unreadable);
  let iv: Bytes;
  let data: Bytes;
  try {
    iv = fromBase64(parts[0]);
    data = fromBase64(parts[1]);
  } catch {
    throw new Error(SECRET_TEXT.unreadable);
  }
  for (const name of ["TOKEN_ENCRYPTION_KEY", "TOKEN_ENCRYPTION_KEY_PREVIOUS"] as const) {
    const bytes = keyBytes(name);
    if (!bytes) continue;
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await importKey(bytes), data);
      return new TextDecoder().decode(plain);
    } catch {
      // Not this key: try the next.
    }
  }
  throw new Error(SECRET_TEXT.unreadable);
}

/** `openSecret` for an optional field. */
export async function openOptional<T extends string | null | undefined>(value: T): Promise<T> {
  return (typeof value === "string" ? await openSecret(value) : value) as T;
}

/** A row with its credential fields decrypted, for an internal function that hands it to an action. */
export async function openRow<T extends Record<string, unknown>>(row: T, fields: readonly string[]): Promise<T> {
  const open: Record<string, unknown> = { ...row };
  for (const field of fields) if (typeof open[field] === "string") open[field] = await openSecret(open[field] as string);
  return open as T;
}

/** Whether a sealed value was made with the previous key only, so the migration re-seals it with the current one. */
export async function needsReseal(value: string): Promise<boolean> {
  if (!isSealed(value)) return encryptionReady();
  const current = keyBytes("TOKEN_ENCRYPTION_KEY");
  if (!current) return false;
  const [ivText, dataText] = value.slice(SEALED_PREFIX.length).split(":");
  try {
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivText) }, await importKey(current), fromBase64(dataText));
    return false;
  } catch {
    return true;
  }
}

/**
 * The credential fields at rest, by table. The migration and the plaintext test read this list; a new credential
 * field must be added here.
 */
export const SECRET_FIELDS = {
  integrationConnections: ["accessToken", "refreshToken", "hookSecret"],
  crmConnections: ["accessToken", "refreshToken"],
  /** A HighLevel marketplace install waiting up to an hour to be claimed. */
  crmPendingInstalls: ["accessToken", "refreshToken"],
  metaConnections: ["accessToken"],
  integrationOauthStates: ["codeVerifier"],
} as const;

export type SecretTable = keyof typeof SECRET_FIELDS;
