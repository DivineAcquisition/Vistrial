/** Official HighLevel marketplace Ed25519 public key for X-GHL-Signature. */
export const GHL_ED25519_PUBLIC_KEY_DEFAULT = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

/** Official HighLevel marketplace RSA public key for legacy X-WH-Signature. */
export const GHL_RSA_PUBLIC_KEY_DEFAULT = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSCFrm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfBcsedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpvuxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKUJ062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXpIocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzNh/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhCHULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJPQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAykT1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export const GHL_API_BASE = "https://services.leadconnectorhq.com";
export const GHL_OAUTH_AUTHORIZE_DEFAULT =
  "https://marketplace.gohighlevel.com/oauth/chooselocation";

export const GHL_OAUTH_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "conversations.readonly",
  "conversations.write",
  "conversations/message.readonly",
  "conversations/message.write",
  "locations.readonly",
  "locations/customFields.readonly",
  "opportunities.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
  "users.readonly",
  "oauth.readonly",
  "oauth.write",
].join(" ");

export const GHL_WEBHOOK_EVENTS = [
  "ContactCreate",
  "ContactUpdate",
  "InboundMessage",
  "OutboundMessage",
  "AppointmentCreate",
  "AppointmentUpdate",
  "OpportunityUpdate",
] as const;

/** Refresh this many milliseconds before expiry, not after a 401. */
export const TOKEN_REFRESH_SKEW_MS = 10 * 60 * 1000;

/** Cron also refreshes tokens that expire within this window. */
export const TOKEN_REFRESH_CRON_MS = 30 * 60 * 1000;

export const WEBHOOK_MAX_ATTEMPTS = 8;

/** GHL burst is 100 / 10s. Stay under that and queue instead of dropping. */
export const GHL_RATE_LIMIT = 80;
export const GHL_RATE_WINDOW_SECONDS = 10;

export const DISPATCH_MAX_ATTEMPTS = 8;

export const OAUTH_STATE_TTL_SECONDS = 15 * 60;
export const OAUTH_SESSION_TTL_MS = 15 * 60 * 1000;

/**
 * Stale ingestion: a connected org with unprocessed events older than this
 * is an emergency. Silent ingest death is the failure this product cannot hide.
 */
export const INGEST_STALE_PENDING_MS = 30 * 60 * 1000;

/** Connected org that has received events but processed none this recently. */
export const INGEST_STALE_SUCCESS_MS = 6 * 60 * 60 * 1000;

export const INGEST_BACKLOG_ALERT_THRESHOLD = 50;
export const INGEST_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export const CONTACT_LOCK_STALE_MS = 5 * 60 * 1000;

export const GHL_OAUTH_COOKIE = "vistrial_ghl_oauth";

export const LOCATION_CLAIMED_MESSAGE =
  "This GoHighLevel location is already linked to another workspace.";
