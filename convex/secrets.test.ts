/**
 * @vitest-environment edge-runtime
 *
 * Token encryption (docs/rebuild/integrations-setup.md, "Token encryption"): AES-256-GCM round trip, a wrong key
 * failing cleanly, plaintext still read during the rollout, every connection type sealing on write and opening on
 * read, the migration sealing what is left and being idempotent, rotation, nothing stored in plaintext once the key
 * is set, and no value ever reaching a public query.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { SEALED_PREFIX, SECRET_FIELDS, SECRET_TEXT, isSealed, openSecret, sealSecret } from "./lib/secrets";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 14, 15);
const DAY = 86_400_000;
const SEALED = /^enc:v1:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the encryption helper", () => {
  it("round-trips with a random IV per value, in the stored format", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey());
    const one = await sealSecret("ya29.secret-access-token");
    const two = await sealSecret("ya29.secret-access-token");
    expect(one).toMatch(SEALED);
    expect(one).not.toBe(two);
    expect(one).not.toContain("secret-access-token");
    expect(await openSecret(one)).toBe("ya29.secret-access-token");
    expect(await openSecret(two)).toBe("ya29.secret-access-token");
    // Sealing a sealed value changes nothing.
    expect(await sealSecret(one)).toBe(one);
  });

  it("fails cleanly with a wrong key, a tampered value or a malformed key, naming no value", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey());
    const sealed = await sealSecret("the-refresh-token");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey());
    const failure = await openSecret(sealed).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(SECRET_TEXT.unreadable);
    expect((failure as Error).message).not.toContain("the-refresh-token");
    await expect(openSecret(`${SEALED_PREFIX}bm90:dGFtcGVyZWQ=`)).rejects.toThrow(SECRET_TEXT.unreadable);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "too-short");
    await expect(sealSecret("x")).rejects.toThrow(SECRET_TEXT.badKey);
  });

  it("reads plaintext as it is, and without a key stores plaintext and warns once, never with the value", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await openSecret("plain-token")).toBe("plain-token");
    expect(await sealSecret("plain-token")).toBe("plain-token");
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toContain("plain-token");
  });

  it("decrypts with the previous key after a rotation", async () => {
    const old = newKey();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", old);
    const sealed = await sealSecret("rotated-token");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey());
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", old);
    expect(await openSecret(sealed)).toBe("rotated-token");
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  return { t, owner, workspaceId };
}

/** Every credential field in the database, by table and field. */
async function storedSecrets(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return t.run(async (ctx) => {
    const out: { table: string; field: string; value: string }[] = [];
    for (const [table, fields] of Object.entries(SECRET_FIELDS)) {
      for (const row of await ctx.db.query(table as keyof typeof SECRET_FIELDS).collect()) {
        for (const field of fields) {
          const value = (row as Record<string, unknown>)[field];
          if (typeof value === "string") out.push({ table, field, value });
        }
      }
    }
    return out;
  });
}

describe("every connection type, with the key set", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey());
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  });

  it("seals on write, opens for the action that uses it, and never shows a value in a public query", async () => {
    const s = await setup();
    // Google Calendar, Calendly and Fireflies (its pasted API key) share integrationConnections.
    await s.t.mutation(internal.integrations.saveConnection, { workspaceId: s.workspaceId, provider: "google_calendar", accessToken: "google-access", refreshToken: "google-refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "g1", accountLabel: "dana@example.com", connectedBy: "dana" });
    await s.t.mutation(internal.integrations.saveConnection, { workspaceId: s.workspaceId, provider: "calendly", accessToken: "calendly-access", refreshToken: "calendly-refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "c1", accountLabel: "Dana", connectedBy: "dana" });
    await s.t.mutation(internal.integrations.saveConnection, { workspaceId: s.workspaceId, provider: "fireflies", accessToken: "fireflies-api-key-0123456789", scopes: [], accountId: "f1", accountLabel: "Dana", connectedBy: "dana" });
    // HighLevel and Meta.
    const hl = await s.t.mutation(internal.highLevel.saveConnection, { workspaceId: s.workspaceId, accessToken: "hl-access", refreshToken: "hl-refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc1", accountName: "Aster", currency: "USD", connectedBy: "dana", calls: 0 });
    await s.t.mutation(internal.metaAds.saveConnection, { workspaceId: s.workspaceId, source: "oauth", accessToken: "meta-access", scopes: ["ads_read"], metaUserId: "m1", metaUserName: "Dana", connectedBy: "dana", calls: 0 });
    // A HighLevel marketplace install waiting to be claimed, then claimed onto a client.
    const code = await s.t.mutation(internal.highLevel.savePending, { accessToken: "hl-pending-access", refreshToken: "hl-pending-refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc2", accountName: "Bright", currency: "USD", calls: 0 });
    const pending = await s.t.run((ctx) => ctx.db.query("crmPendingInstalls").collect());
    expect(pending.map((row) => [row.accessToken, row.refreshToken].every((value) => SEALED.test(value)))).toEqual([true]);
    const clientId = await s.owner.mutation(api.clients.create, { workspaceId: s.workspaceId, type: "business", name: "Bright" });
    await s.owner.mutation(api.highLevel.claimInstall, { workspaceId: s.workspaceId, code, clientId });
    const claimed = await s.t.run((ctx) => ctx.db.query("crmConnections").collect());
    const bright = claimed.find((row) => row.accountId === "loc2")!;
    // Moved as stored, not sealed twice: it opens to the real token in one step.
    expect(await openSecret(bright.accessToken)).toBe("hl-pending-access");
    expect(await s.t.query(internal.highLevel.connectionById, { connectionId: bright._id })).toMatchObject({ accessToken: "hl-pending-access", refreshToken: "hl-pending-refresh" });
    // A PKCE verifier, made by a real sign-in start.
    const start = await s.owner.mutation(api.integrations.startConnect, { workspaceId: s.workspaceId, provider: "google_calendar" });

    // Nothing is stored in plaintext.
    const stored = await storedSecrets(s.t);
    expect(stored.map((row) => `${row.table}.${row.field}`).sort()).toEqual(
      [
        "crmConnections.accessToken",
        "crmConnections.accessToken",
        "crmConnections.refreshToken",
        "crmConnections.refreshToken",
        "integrationConnections.accessToken",
        "integrationConnections.accessToken",
        "integrationConnections.accessToken",
        "integrationConnections.refreshToken",
        "integrationConnections.refreshToken",
        "integrationOauthStates.codeVerifier",
        "metaConnections.accessToken",
      ].sort(),
    );
    for (const row of stored) expect(row.value, `${row.table}.${row.field}`).toMatch(SEALED);

    // Each read path hands the action the real value.
    const google = await s.t.query(internal.integrations.connectionFor, { workspaceId: s.workspaceId, provider: "google_calendar" });
    expect(google).toMatchObject({ accessToken: "google-access", refreshToken: "google-refresh" });
    expect(await s.t.query(internal.noteTakers.firefliesKey, { workspaceId: s.workspaceId })).toBe("fireflies-api-key-0123456789");
    expect(await s.t.mutation(internal.integrations.claimRefresh, { connectionId: google!._id })).toEqual({ state: "claimed", refreshToken: "google-refresh" });
    if (!hl.ok) throw new Error("HighLevel connection was not saved");
    expect(await s.t.query(internal.highLevel.connectionById, { connectionId: hl.connectionId })).toMatchObject({ accessToken: "hl-access", refreshToken: "hl-refresh" });
    expect(await s.t.mutation(internal.highLevel.claimRefresh, { connectionId: hl.connectionId })).toEqual({ state: "claimed", refreshToken: "hl-refresh" });
    expect(await s.t.query(internal.metaAds.connectionFor, { workspaceId: s.workspaceId })).toMatchObject({ accessToken: "meta-access" });
    const nonce = new URL(start.url).searchParams.get("state")!;
    const state = await s.t.mutation(internal.integrations.consumeState, { nonce });
    // The verifier comes back opened (a PKCE verifier is 43 to 128 unreserved characters), never sealed.
    expect(state?.codeVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);

    // The refresh paths write sealed values too.
    await s.t.mutation(internal.integrations.saveTokens, { connectionId: google!._id, accessToken: "google-access-2", refreshToken: "google-refresh-2", tokenExpiresAt: NOW + 2 * DAY });
    await s.t.mutation(internal.highLevel.saveTokens, { connectionId: hl.connectionId, accessToken: "hl-access-2", refreshToken: "hl-refresh-2", tokenExpiresAt: NOW + 2 * DAY });
    for (const row of await storedSecrets(s.t)) expect(row.value, `${row.table}.${row.field}`).toMatch(SEALED);
    expect(await s.t.query(internal.integrations.connectionFor, { workspaceId: s.workspaceId, provider: "google_calendar" })).toMatchObject({ accessToken: "google-access-2", refreshToken: "google-refresh-2" });
    expect(await s.t.query(internal.highLevel.connectionById, { connectionId: hl.connectionId })).toMatchObject({ accessToken: "hl-access-2", refreshToken: "hl-refresh-2" });

    // A webhook signing secret stored per connection is opened for the signature check.
    await s.t.run(async (ctx) => ctx.db.patch(google!._id, { hookId: "a".repeat(32), hookSecret: await sealSecret("whsec_signing") }));
    expect(await s.t.query(internal.integrations.hookTarget, { hookId: "a".repeat(32) })).toMatchObject({ hookSecret: "whsec_signing" });

    // Disconnecting hands back the real token, so the provider can cancel it.
    const removed = await s.t.mutation(internal.integrations.removeConnection, { workspaceId: s.workspaceId, provider: "calendly", userId: "dana" });
    expect(removed).toEqual({ removed: true, token: "calendly-refresh" });

    // No public query returns a value, sealed or not.
    const shown = JSON.stringify([
      await s.owner.query(api.integrations.list, { workspaceId: s.workspaceId }),
      await s.owner.query(api.highLevel.status, { workspaceId: s.workspaceId }),
      await s.owner.query(api.highLevel.overview, { workspaceId: s.workspaceId }),
      await s.owner.query(api.metaAds.status, { workspaceId: s.workspaceId }),
      await s.owner.query(api.noteTakers.status, { workspaceId: s.workspaceId }),
    ]);
    for (const value of ["google-access", "google-refresh", "hl-access", "hl-refresh", "meta-access", "fireflies-api-key", "whsec_signing", SEALED_PREFIX]) expect(shown).not.toContain(value);
  });
});

describe("the migration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  async function plaintextRows(s: Awaited<ReturnType<typeof setup>>) {
    return s.t.run(async (ctx) => {
      const workspaceId = s.workspaceId;
      const base = { workspaceId, scopes: [], connectedBy: "dana", connectedAt: NOW };
      const ids: Id<"integrationConnections">[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(await ctx.db.insert("integrationConnections", { ...base, provider: `p${i}`, status: "connected", accessToken: `plain-access-${i}`, ...(i === 0 ? { refreshToken: "plain-refresh-0", hookSecret: "plain-hook" } : {}), accountId: `a${i}`, accountLabel: "x" }));
      }
      await ctx.db.insert("crmConnections", { ...base, provider: "highlevel", status: "connected", accessToken: "plain-hl-access", refreshToken: "plain-hl-refresh", tokenExpiresAt: NOW + DAY, accountId: "loc1", accountName: "Aster", currency: "USD", callsOk: 0, callsFailed: 0 });
      await ctx.db.insert("metaConnections", { ...base, source: "oauth", accessToken: "plain-meta", metaUserId: "m1", metaUserName: "Dana", status: "connected", callsOk: 0, callsFailed: 0 });
      await ctx.db.insert("integrationOauthStates", { workspaceId, userId: "dana", provider: "google_calendar", nonce: "n".repeat(48), codeVerifier: "plain-verifier", createdAt: NOW });
      await ctx.db.insert("crmPendingInstalls", { provider: "highlevel", claimCode: "c".repeat(48), accessToken: "plain-pending-access", refreshToken: "plain-pending-refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc9", accountName: "Pending", currency: "USD", calls: 0, createdAt: NOW });
      return ids;
    });
  }

  it("does nothing without a key, then seals every plaintext value in place, idempotently", async () => {
    const s = await setup();
    await plaintextRows(s);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(await s.t.mutation(internal.secretsMigration.encryptExisting, {})).toMatchObject({ done: false, reason: "no_key" });
    expect((await storedSecrets(s.t)).every((row) => !isSealed(row.value))).toBe(true);
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toMatch(/plain-/);

    // Plaintext is still read during the rollout.
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey());
    expect(await s.t.query(internal.metaAds.connectionFor, { workspaceId: s.workspaceId })).toMatchObject({ accessToken: "plain-meta" });

    await s.t.mutation(internal.secretsMigration.encryptExisting, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await storedSecrets(s.t);
    expect(after).toHaveLength(11);
    for (const row of after) expect(row.value, `${row.table}.${row.field}`).toMatch(SEALED);
    expect((await Promise.all(after.map((row) => openSecret(row.value)))).sort()).toEqual(
      ["plain-access-0", "plain-access-1", "plain-access-2", "plain-hl-access", "plain-hl-refresh", "plain-hook", "plain-meta", "plain-pending-access", "plain-pending-refresh", "plain-refresh-0", "plain-verifier"].sort(),
    );
    // Reads still work for every connection type.
    expect(await s.t.query(internal.metaAds.connectionFor, { workspaceId: s.workspaceId })).toMatchObject({ accessToken: "plain-meta" });

    // A second run changes nothing.
    await s.t.mutation(internal.secretsMigration.encryptExisting, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await storedSecrets(s.t)).toEqual(after);
  });

  it("re-seals values made with the previous key after a rotation", async () => {
    const s = await setup();
    await plaintextRows(s);
    const old = newKey();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", old);
    await s.t.mutation(internal.secretsMigration.encryptExisting, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const fresh = newKey();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", fresh);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", old);
    await s.t.mutation(internal.secretsMigration.encryptExisting, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    // The previous key can now be removed: everything opens with the current key alone.
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", "");
    for (const row of await storedSecrets(s.t)) expect(await openSecret(row.value)).toMatch(/^plain-/);
  });
});
