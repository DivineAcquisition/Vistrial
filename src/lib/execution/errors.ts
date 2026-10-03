/**
 * Plain-language failures, and the guard that keeps credentials out of
 * messages, logs, and the write log.
 *
 * A ProviderError carries words a person can act on. Its text is written
 * here, never copied from a provider response, so a raw error or a token can
 * not ride along in it.
 */

export type ProviderErrorCode =
  /** The token is gone or revoked. The connection needs reconnecting. */
  | "auth"
  /** The channel or folder is gone or no longer reachable. Pick another. */
  | "destination"
  /** Try again later. Nothing is wrong with the connection. */
  | "transient"
  /** The provider refused this one post or file. */
  | "rejected"
  /** This deployment does not have the provider's app credentials. */
  | "unconfigured";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Shapes of credentials these three providers (and our own ciphertext) use. */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /xox[abposr]-[A-Za-z0-9-]{8,}/,
  /xapp-[A-Za-z0-9-]{8,}/,
  /ya29\.[A-Za-z0-9_-]{16,}/,
  /1\/\/[A-Za-z0-9_-]{30,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /[MNO][A-Za-z\d]{23,27}\.[\w-]{6}\.[\w-]{25,}/,
  /\bv1\.[A-Za-z0-9+/=]{12,}\.[A-Za-z0-9+/=]{12,}\.[A-Za-z0-9+/=]{4,}/,
];

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function scrubSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, "g"), "[redacted]");
  }
  return out;
}

/** What a thrown value becomes when it has to be shown or stored. */
export function plainErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ProviderError) return error.message;
  return fallback;
}
