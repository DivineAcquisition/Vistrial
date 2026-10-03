import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_TYPES } from "@/lib/home/catalog";
import { redactForLog } from "@/lib/ghl/redact";
import { encryptSecret } from "@/lib/ghl/crypto";
import { clearConnection } from "@/lib/execution/connections";
import { discordAuthorizeUrl, discordChannelInGuild, discordEmbed } from "@/lib/execution/discord";
import { ProviderError, looksLikeSecret, scrubSecrets } from "@/lib/execution/errors";
import { driveAuthorizeUrl, driveExchangeCode, sanitizeSegment } from "@/lib/execution/google-drive";
import {
  DISCORD_ADMINISTRATOR,
  DISCORD_PERMISSIONS,
  EXECUTION_ACTION_TYPES,
  EXECUTION_OPERATIONS,
  GOOGLE_DRIVE_SCOPE,
  SLACK_BOT_SCOPES,
} from "@/lib/execution/kinds";
import * as operations from "@/lib/execution/operations";
import { describeConnection, EXECUTION_FLASH_ERRORS } from "@/lib/execution/state";
import { escapeSlack, slackAuthorizeUrl, slackBlocks, slackExchangeCode } from "@/lib/execution/slack";
import type { GhlDb } from "@/lib/ghl/tokens";

/*
 * These tests run the real code against an in-memory database and a mocked
 * `fetch`. They prove the rules (scopes, who may write, where a write can
 * land, what gets logged). They do not prove Slack, Discord, or Google behave
 * as assumed; that is checked against real accounts, see
 * docs/execution-integrations.md.
 */

// Obviously fake, but shaped like the real thing so the scrubbers recognise them.
const FAKE_SLACK_TOKEN = "xoxb-FAKE-0000000000-TESTTESTTEST";
const FAKE_GOOGLE_ACCESS = "ya29.FAKE_ACCESS_TOKEN_0000000000";
const FAKE_GOOGLE_REFRESH = "1//FAKE_REFRESH_TOKEN_000000000000000000000000";
const FAKE_BOT = "MFAKEBOTTOKENFAKEBOTTOKE.FAKE00.FAKEBOTTOKENFAKEBOTTOKENFAKEBOTT";

const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SETTER = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const ROOT = "ROOTFOLDERID_0000000001";

type Row = Record<string, unknown>;

/** Just enough of the query builder for the code under test. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  let counter = 0;

  class Query implements PromiseLike<{ data: unknown; error: null }> {
    private filters: Array<(row: Row) => boolean> = [];
    private mode: "select" | "insert" | "update" = "select";
    private payload: Row = {};
    constructor(private table: string) {
      tables[table] ??= [];
    }
    select() {
      return this;
    }
    insert(row: Row) {
      this.mode = "insert";
      this.payload = row;
      return this;
    }
    update(patch: Row) {
      this.mode = "update";
      this.payload = patch;
      return this;
    }
    upsert(row: Row) {
      this.mode = "insert";
      this.payload = row;
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    neq(column: string, value: unknown) {
      this.filters.push((row) => row[column] !== value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    private run(): Row[] {
      const rows = tables[this.table];
      if (this.mode === "insert") {
        const inserted = { id: `row-${(counter += 1)}`, ...this.payload };
        rows.push(inserted);
        return [inserted];
      }
      const matched = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.mode === "update") for (const row of matched) Object.assign(row, this.payload);
      return matched;
    }
    maybeSingle() {
      return Promise.resolve({ data: this.run()[0] ?? null, error: null });
    }
    then<A, B>(
      onfulfilled?: ((value: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
    ) {
      return Promise.resolve({ data: this.run(), error: null as null }).then(onfulfilled, onrejected);
    }
  }

  return {
    db: { from: (table: string) => new Query(table) } as unknown as GhlDb,
    rows: (table: string) => tables[table] ?? [],
  };
}

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

function mockFetch(handler: (call: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const call: Call = {
        url: String(input),
        method: init.method ?? "GET",
        headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
        body:
          init.body instanceof URLSearchParams
            ? init.body.toString()
            : typeof init.body === "string"
              ? init.body
              : init.body
                ? Buffer.from(init.body as Uint8Array).toString("utf8")
                : "",
      };
      calls.push(call);
      const reply = handler(call);
      return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status ?? 200 });
    })
  );
  return calls;
}

function baseSeed(overrides: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    organizations: [{ id: ORG, agents_halted: false }],
    org_members: [
      { id: OWNER, org_id: ORG, role: "owner", active: true, display_name: "Olive Owner" },
      { id: SETTER, org_id: ORG, role: "setter", active: true, display_name: "Sam Setter" },
    ],
    approval_gate_actions: [],
    approval_gate_settings: [],
    approval_items: [],
    execution_connections: [],
    execution_writes: [],
    agent_events: [],
    ...overrides,
  };
}

function connection(kind: string, extra: Row = {}): Row {
  return {
    org_id: ORG,
    kind,
    status: "active",
    account_label: "Acme",
    external_account_id: "EXT1",
    secret_encrypted: null,
    refresh_encrypted: null,
    token_expires_at: null,
    destination_id: "DEST1",
    destination_label: "#sales",
    metadata: {},
    last_error: null,
    last_verified_at: null,
    ...extra,
  };
}

beforeEach(() => {
  process.env.GHL_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.SLACK_CLIENT_ID = "test-slack-client";
  process.env.SLACK_CLIENT_SECRET = "test-slack-secret";
  process.env.DISCORD_CLIENT_ID = "test-discord-client";
  process.env.DISCORD_CLIENT_SECRET = "test-discord-secret";
  process.env.DISCORD_BOT_TOKEN = FAKE_BOT;
  process.env.GOOGLE_DRIVE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-google-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scopes and permissions", () => {
  it("asks Slack for exactly post, list public channels, and join", () => {
    const url = new URL(slackAuthorizeUrl("state123"));
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("scope")).toBe("chat:write,channels:read,channels:join");
    expect([...SLACK_BOT_SCOPES]).toEqual(["chat:write", "channels:read", "channels:join"]);
    expect(url.searchParams.has("user_scope")).toBe(false);
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/execution/oauth/callback");
    expect(url.searchParams.get("state")).toBe("state123");
  });

  it("invites the Discord bot with View Channels and Send Messages only", () => {
    const url = new URL(discordAuthorizeUrl("s"));
    expect(url.searchParams.get("scope")).toBe("bot");
    expect(url.searchParams.get("permissions")).toBe("3072");
    expect(DISCORD_PERMISSIONS).toBe(3072);
    expect(DISCORD_PERMISSIONS & DISCORD_ADMINISTRATOR).toBe(0);
    expect(DISCORD_PERMISSIONS & ~((1 << 10) | (1 << 11))).toBe(0);
  });

  it("asks Google for drive.file and never the broader drive scope", () => {
    const url = new URL(driveAuthorizeUrl("s"));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(GOOGLE_DRIVE_SCOPE).toBe("https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("scope")).not.toMatch(/auth\/drive($|\s)/);
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
  });

  it("refuses a Slack install that carries more than it asked for, and revokes it", async () => {
    const calls = mockFetch((call) =>
      call.url.endsWith("oauth.v2.access")
        ? {
            json: {
              ok: true,
              token_type: "bot",
              access_token: FAKE_SLACK_TOKEN,
              scope: "chat:write,channels:read,channels:join,channels:history",
              team: { id: "T1", name: "Acme" },
            },
          }
        : { json: { ok: true } }
    );
    await expect(slackExchangeCode("code")).rejects.toThrow(/more access/);
    expect(calls.some((call) => call.url.endsWith("auth.revoke"))).toBe(true);
  });

  it("refuses a Google grant that is not exactly drive.file", async () => {
    const calls = mockFetch((call) =>
      call.url.includes("/token")
        ? {
            json: {
              access_token: FAKE_GOOGLE_ACCESS,
              refresh_token: FAKE_GOOGLE_REFRESH,
              expires_in: 3600,
              scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
            },
          }
        : { json: {} }
    );
    await expect(driveExchangeCode("code")).rejects.toThrow(/more access/);
    expect(calls.some((call) => call.url.includes("/revoke"))).toBe(true);
  });

  it("accepts a Google grant of drive.file alone", async () => {
    mockFetch(() => ({
      json: { access_token: FAKE_GOOGLE_ACCESS, refresh_token: FAKE_GOOGLE_REFRESH, expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE },
    }));
    const grant = await driveExchangeCode("code");
    expect(grant.accessToken).toBe(FAKE_GOOGLE_ACCESS);
  });
});

describe("only three named operations", () => {
  it("has no generic way to post to a service", () => {
    expect([...EXECUTION_OPERATIONS]).toEqual(["slack.post_message", "discord.post_message", "drive.store_asset"]);
    expect(Object.keys(operations).sort()).toEqual([
      "postDiscordMessage",
      "postSlackMessage",
      "sendConnectionTest",
      "storeDriveAsset",
    ]);
  });

  it("keeps the action types in step with the database and the Home catalog", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261003030000_execution_integrations.sql"),
      "utf8"
    );
    const seeded = [...migration.matchAll(/\('([a-z_]+)', '([a-z_]+)', (true|false), '([a-z_]+)'\)/g)].map(
      ([, id, area, reaches, mode]) => ({ id, area, reachesPeople: reaches === "true", defaultMode: mode })
    );
    const inCatalog = ACTION_TYPES.filter((type) => Object.values(EXECUTION_ACTION_TYPES).includes(type.id as never)).map(
      (type) => ({ id: type.id, area: type.area, reachesPeople: type.reachesPeople, defaultMode: type.defaultMode })
    );
    expect(seeded).toEqual(inCatalog);
    expect(seeded).toHaveLength(3);
  });
});

describe("Slack posts", () => {
  const message = { title: "Rebooked 2 no-shows", summary: "Hello <!channel> & team", fields: [{ label: "Owner", value: "<@U123>" }] };

  function slackSeed(grants: Row[] = []) {
    return fakeDb(
      baseSeed({
        execution_connections: [connection("slack", { secret_encrypted: encryptSecret(FAKE_SLACK_TOKEN), destination_id: "C0SALES" })],
        approval_gate_actions: grants,
      })
    );
  }

  it("posts to the stored channel with the workspace token, and logs it with the authorising person", async () => {
    const { db, rows } = slackSeed();
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1700000000.000100" } }));
    const result = await operations.postSlackMessage(db, {
      orgId: ORG,
      message,
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(result).toMatchObject({ ok: true, externalRef: "1700000000.000100" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${FAKE_SLACK_TOKEN}`);
    const body = JSON.parse(calls[0].body);
    expect(body.channel).toBe("C0SALES");
    expect(body.unfurl_links).toBe(false);

    const log = rows("execution_writes");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      status: "sent",
      kind: "slack",
      operation: "slack.post_message",
      destination_id: "C0SALES",
      destination_label: "#sales",
      authorization_kind: "owner_test",
      authorized_by_member_id: OWNER,
    });
    expect(String(log[0].content)).toContain("Rebooked 2 no-shows");
    expect(JSON.stringify(log)).not.toContain(FAKE_SLACK_TOKEN);
  });

  it("neutralises mentions so a post cannot ping the channel or a person", () => {
    expect(escapeSlack("<!channel> <@U1> a&b")).toBe("&lt;!channel&gt; &lt;@U1&gt; a&amp;b");
    const text = JSON.stringify(slackBlocks(message));
    expect(text).not.toContain("<!channel>");
    expect(text).not.toContain("<@U123>");
  });

  it("will not post on auto-run unless the workspace set this action to auto-run", async () => {
    const { db, rows } = slackSeed();
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1" } }));
    const result = await operations.postSlackMessage(db, { orgId: ORG, message, authorization: { kind: "auto_run" } });
    expect(result).toMatchObject({ ok: false, blocked: true });
    expect(calls).toHaveLength(0);
    expect(rows("execution_writes")[0]).toMatchObject({ status: "blocked", authorization_kind: "auto_run" });

    const allowed = slackSeed([{ org_id: ORG, action_type: "slack_post", mode: "auto_run", approver: "owners_and_managers" }]);
    mockFetch(() => ({ json: { ok: true, ts: "2" } }));
    const sent = await operations.postSlackMessage(allowed.db, { orgId: ORG, message, authorization: { kind: "auto_run" } });
    expect(sent.ok).toBe(true);
    expect(allowed.rows("agent_events")[0]).toMatchObject({ action_taken: "slack_post" });
  });

  it("needs a real running approval of the matching type", async () => {
    const { db, rows } = slackSeed();
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1" } }));

    const none = await operations.postSlackMessage(db, {
      orgId: ORG,
      message,
      authorization: { kind: "approval_item", approvalItemId: ITEM, approvedByMemberId: OWNER },
    });
    expect(none).toMatchObject({ ok: false, blocked: true });

    rows("approval_items").push({ id: ITEM, org_id: ORG, action_type: "discord_post", status: "running" });
    const wrongType = await operations.postSlackMessage(db, {
      orgId: ORG,
      message,
      authorization: { kind: "approval_item", approvalItemId: ITEM, approvedByMemberId: OWNER },
    });
    expect(wrongType).toMatchObject({ ok: false, blocked: true });
    expect(calls).toHaveLength(0);

    rows("approval_items")[0].action_type = "slack_post";
    const ok = await operations.postSlackMessage(db, {
      orgId: ORG,
      message,
      authorization: { kind: "approval_item", approvalItemId: ITEM, approvedByMemberId: OWNER },
    });
    expect(ok.ok).toBe(true);
    const sent = rows("execution_writes").find((row) => row.status === "sent");
    expect(sent).toMatchObject({ approval_item_id: ITEM, authorized_by_member_id: OWNER, authorization_kind: "approval_item" });
    expect(rows("agent_events")[0]).toMatchObject({ action_taken: "slack_post" });
  });

  it("does not let a setter send a test", async () => {
    const { db } = slackSeed();
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1" } }));
    const result = await operations.postSlackMessage(db, {
      orgId: ORG,
      message,
      authorization: { kind: "owner_test", memberId: SETTER },
    });
    expect(result).toMatchObject({ ok: false, blocked: true });
    expect(calls).toHaveLength(0);
  });

  it("stops everything when the workspace's agents are paused, or the action is off", async () => {
    const paused = fakeDb(
      baseSeed({
        organizations: [{ id: ORG, agents_halted: true }],
        execution_connections: [connection("slack", { secret_encrypted: encryptSecret(FAKE_SLACK_TOKEN) })],
      })
    );
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1" } }));
    expect(
      await operations.postSlackMessage(paused.db, { orgId: ORG, message, authorization: { kind: "owner_test", memberId: OWNER } })
    ).toMatchObject({ ok: false, blocked: true });

    const off = slackSeed([{ org_id: ORG, action_type: "slack_post", mode: "off", approver: "owners_and_managers" }]);
    expect(
      await operations.postSlackMessage(off.db, { orgId: ORG, message, authorization: { kind: "owner_test", memberId: OWNER } })
    ).toMatchObject({ ok: false, blocked: true });
    expect(calls).toHaveLength(0);
  });

  it("will not send, or log, anything shaped like a credential", async () => {
    const { db, rows } = slackSeed();
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1" } }));
    const result = await operations.postSlackMessage(db, {
      orgId: ORG,
      message: { title: "Debug", summary: `token is ${FAKE_SLACK_TOKEN}` },
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(result).toMatchObject({ ok: false, blocked: true });
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(rows("execution_writes"))).not.toContain(FAKE_SLACK_TOKEN);
  });

  it("turns a revoked token into a plain card state, never the raw code", async () => {
    const { db, rows } = slackSeed();
    mockFetch(() => ({ json: { ok: false, error: "token_revoked" } }));
    const result = await operations.postSlackMessage(db, {
      orgId: ORG,
      message,
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(result).toMatchObject({ ok: false, blocked: false });
    if (!result.ok) expect(result.error).not.toMatch(/token_revoked|invalid_auth|_/);
    const stored = rows("execution_connections")[0];
    expect(stored.status).toBe("broken");
    expect(String(stored.last_error)).toMatch(/Reconnect Slack/);
    expect(rows("execution_writes")[0]).toMatchObject({ status: "failed" });
  });

  it("halts posting the moment the connection is cleared, and deletes nothing", async () => {
    const { db, rows } = slackSeed();
    const calls = mockFetch(() => ({ json: { ok: true, ts: "1" } }));
    await operations.postSlackMessage(db, { orgId: ORG, message, authorization: { kind: "owner_test", memberId: OWNER } });
    expect(calls).toHaveLength(1);

    await clearConnection(db, ORG, "slack");
    const after = await operations.postSlackMessage(db, { orgId: ORG, message, authorization: { kind: "owner_test", memberId: OWNER } });
    expect(after).toMatchObject({ ok: false, blocked: true });
    expect(calls).toHaveLength(1);
    expect(rows("execution_connections")[0]).toMatchObject({ status: "inactive", secret_encrypted: null, destination_id: null });
    // History is kept: the earlier post and the blocked attempt are both still logged.
    expect(rows("execution_writes").map((row) => row.status)).toEqual(["sent", "blocked"]);
    expect(calls.every((call) => call.method === "POST" && !call.url.includes("delete"))).toBe(true);
  });
});

describe("Discord posts", () => {
  it("posts an embed with mentions switched off, using the bot, to the stored channel", async () => {
    const { db, rows } = fakeDb(
      baseSeed({ execution_connections: [connection("discord", { external_account_id: "G1", destination_id: "CH1", destination_label: "#updates" })] })
    );
    const calls = mockFetch(() => ({ json: { id: "999" } }));
    const result = await operations.postDiscordMessage(db, {
      orgId: ORG,
      message: { title: "Rebooked 2 no-shows", summary: "@everyone look", fields: [{ label: "Owner", value: "Sam" }] },
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(result).toMatchObject({ ok: true, externalRef: "999" });
    expect(calls[0].url).toBe("https://discord.com/api/v10/channels/CH1/messages");
    expect(calls[0].headers.Authorization).toBe(`Bot ${FAKE_BOT}`);
    const body = JSON.parse(calls[0].body);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0].title).toBe("Rebooked 2 no-shows");
    expect(rows("execution_writes")[0]).toMatchObject({ status: "sent", destination_label: "#updates" });
    expect(JSON.stringify(rows("execution_writes"))).not.toContain(FAKE_BOT);
  });

  it("keeps embeds inside Discord's limits", () => {
    const embed = discordEmbed({
      title: "t".repeat(400),
      summary: "s".repeat(5000),
      fields: Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, value: "v".repeat(2000) })),
    }) as { title: string; description: string; fields: Array<{ value: string }> };
    expect(embed.title.length).toBeLessThanOrEqual(256);
    expect(embed.description.length).toBeLessThanOrEqual(4000);
    expect(embed.fields.length).toBeLessThanOrEqual(10);
    expect(embed.fields.every((field) => field.value.length <= 1024)).toBe(true);
  });

  it("only accepts a channel that is in the connected server", async () => {
    mockFetch(() => ({ json: [{ id: "A", name: "general", type: 0, position: 0 }, { id: "V", name: "voice", type: 2, position: 1 }] }));
    expect(await discordChannelInGuild("G1", "A")).toEqual({ id: "A", name: "general" });
    expect(await discordChannelInGuild("G1", "V")).toBeNull();
    expect(await discordChannelInGuild("G1", "SOMEONE_ELSES")).toBeNull();
  });

  it("explains a removed bot in plain words and marks the card", async () => {
    const { db, rows } = fakeDb(baseSeed({ execution_connections: [connection("discord", { external_account_id: "G1" })] }));
    mockFetch(() => ({ status: 403, json: { code: 50013, message: "Missing Permissions" } }));
    const result = await operations.postDiscordMessage(db, {
      orgId: ORG,
      message: { title: "x" },
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bot can no longer see or post/);
    expect(rows("execution_connections")[0].status).toBe("broken");
  });
});

describe("Drive filing", () => {
  function driveSeed() {
    return fakeDb(
      baseSeed({
        execution_connections: [
          connection("google_drive", {
            secret_encrypted: encryptSecret(FAKE_GOOGLE_ACCESS),
            refresh_encrypted: encryptSecret(FAKE_GOOGLE_REFRESH),
            token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            destination_id: ROOT,
            destination_label: "Vistrial",
          }),
        ],
      })
    );
  }

  /** A tiny Drive: folders by id, with the parent each was made under. */
  function fakeDrive() {
    const folders = new Map<string, { name: string; parent: string | null }>([[ROOT, { name: "Vistrial", parent: null }]]);
    let n = 0;
    const calls = mockFetch((call) => {
      const url = new URL(call.url);
      if (url.pathname === `/drive/v3/files/${ROOT}`) {
        return { json: { id: ROOT, name: "Vistrial", mimeType: "application/vnd.google-apps.folder", trashed: false, capabilities: { canAddChildren: true } } };
      }
      if (url.pathname === "/drive/v3/files" && call.method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const parent = /'([^']+)' in parents/.exec(q)?.[1];
        const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\(.)/g, "$1");
        const hit = [...folders.entries()].find(([, f]) => f.parent === parent && f.name === name);
        return { json: { files: hit ? [{ id: hit[0] }] : [] } };
      }
      if (url.pathname === "/drive/v3/files" && call.method === "POST") {
        const body = JSON.parse(call.body);
        const parent = body.parents?.[0] as string | undefined;
        if (!parent || !folders.has(parent)) {
          return { status: 404, json: { error: { errors: [{ reason: "notFound" }] } } };
        }
        const id = `FOLDER_${(n += 1)}`;
        folders.set(id, { name: body.name, parent });
        return { json: { id } };
      }
      if (url.pathname === "/upload/drive/v3/files") {
        return { json: { id: "FILE_1", name: "report.txt", webViewLink: "https://drive.example/file" } };
      }
      return { status: 404, json: {} };
    });
    return { calls, folders };
  }

  it("files inside the root only: every parent in the chain descends from it", async () => {
    const { db, rows } = driveSeed();
    const { calls, folders } = fakeDrive();
    const result = await operations.storeDriveAsset(db, {
      orgId: ORG,
      assetKind: "Call summaries",
      fileName: "report.txt",
      content: "hello",
      authorization: { kind: "owner_test", memberId: OWNER },
      now: new Date("2026-10-03T12:00:00Z"),
    });
    expect(result).toMatchObject({ ok: true, externalRef: "FILE_1" });

    // Every folder Vistrial made hangs off the root, through the layout's path.
    const made = [...folders.entries()].filter(([id]) => id !== ROOT);
    expect(made.map(([, f]) => f.name)).toEqual(["Call summaries", "2026-10"]);
    for (const [, folder] of made) expect(folders.has(folder.parent as string)).toBe(true);
    expect(made[0][1].parent).toBe(ROOT);

    // The upload's parent is the deepest folder, not the root and not anything else.
    const upload = calls.find((call) => call.url.includes("/upload/drive/v3/files"));
    expect(upload?.body).toContain(`"parents":["${made[1][0]}"]`);

    // It never moves, renames, trashes, or deletes anything.
    expect(calls.every((call) => call.method === "GET" || call.method === "POST")).toBe(true);
    expect(calls.some((call) => /\/(copy|trash|watch)|supportsAllDrives/.test(call.url))).toBe(false);

    expect(rows("execution_writes")[0]).toMatchObject({
      status: "sent",
      operation: "drive.store_asset",
      authorized_by_member_id: OWNER,
      external_ref: "FILE_1",
    });
    expect(String(rows("execution_writes")[0].content)).toContain("Vistrial / Call summaries / 2026-10 / report.txt");
    expect(JSON.stringify(rows("execution_writes"))).not.toContain(FAKE_GOOGLE_ACCESS);
  });

  it("is rejected, and logged as failed, when the root is not one Google lets the app reach", async () => {
    const { db, rows } = driveSeed();
    // Google answers 404 for any folder drive.file does not cover.
    mockFetch(() => ({ status: 404, json: { error: { errors: [{ reason: "notFound" }] } } }));
    const result = await operations.storeDriveAsset(db, {
      orgId: ORG,
      assetKind: "Call summaries",
      fileName: "report.txt",
      content: "hello",
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/can no longer reach the Drive folder/);
    expect(rows("execution_writes")[0]).toMatchObject({ status: "failed" });
    expect(rows("execution_connections")[0].status).toBe("broken");
  });

  it("cannot be pointed at another folder: names are neutralised, there is no parent argument", async () => {
    expect(sanitizeSegment("../../My Drive")).toBe("..-..-My Drive");
    expect(sanitizeSegment("..")).toBe("-");
    expect(sanitizeSegment("a/b\\c:d")).toBe("a-b-c-d");
    expect(sanitizeSegment("   ")).toBe("Untitled");
    expect(sanitizeSegment("x".repeat(300))).toHaveLength(100);
    // A name with a quote cannot break out of the search query.
    const { db } = driveSeed();
    const { calls } = fakeDrive();
    await operations.storeDriveAsset(db, {
      orgId: ORG,
      assetKind: "x' or '1'='1",
      fileName: "a.txt",
      content: "hello",
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    const search = calls.find((call) => call.method === "GET" && call.url.includes("q="));
    expect(decodeURIComponent(search?.url ?? "")).toContain("name = 'x\\' or \\'1\\'=\\'1'");
    expect(Object.keys(operations)).not.toContain("driveCreateIn");
  });

  it("refreshes an expiring token without leaking it", async () => {
    const { db, rows } = fakeDb(
      baseSeed({
        execution_connections: [
          connection("google_drive", {
            secret_encrypted: encryptSecret(FAKE_GOOGLE_ACCESS),
            refresh_encrypted: encryptSecret(FAKE_GOOGLE_REFRESH),
            token_expires_at: new Date(Date.now() - 1000).toISOString(),
            destination_id: ROOT,
          }),
        ],
      })
    );
    const calls = mockFetch((call) => {
      if (call.url.includes("oauth2.googleapis.com/token")) {
        return { json: { access_token: "ya29.FAKE_REFRESHED_TOKEN_0000000000", expires_in: 3600 } };
      }
      return { status: 404, json: {} };
    });
    await operations.storeDriveAsset(db, {
      orgId: ORG,
      assetKind: "k",
      fileName: "a.txt",
      content: "x",
      authorization: { kind: "owner_test", memberId: OWNER },
    });
    expect(calls[0].url).toContain("oauth2.googleapis.com/token");
    expect(calls[0].body).toContain("grant_type=refresh_token");
    expect(String(rows("execution_connections")[0].secret_encrypted)).toMatch(/^v1\./);
    expect(JSON.stringify(rows("execution_writes"))).not.toContain("ya29.");
  });
});

describe("tokens stay out of text", () => {
  it("recognises and scrubs each credential shape, and leaves ordinary text alone", () => {
    for (const secret of [FAKE_SLACK_TOKEN, FAKE_GOOGLE_ACCESS, FAKE_GOOGLE_REFRESH, FAKE_BOT, "xapp-1-FAKE-0000000000-fake", encryptSecret("x")]) {
      expect(looksLikeSecret(`here: ${secret} end`), secret).toBe(true);
      expect(scrubSecrets(`here: ${secret} end`)).toBe("here: [redacted] end");
    }
    expect(looksLikeSecret("Rebooked 2 no-shows and followed up with 5 quiet leads")).toBe(false);
  });

  it("is caught by the shared log redactor even under an innocent key", () => {
    const redacted = redactForLog({ note: `fine ${FAKE_SLACK_TOKEN}`, channel: "sales" }) as Record<string, string>;
    expect(redacted.note).toBe("[redacted]");
    expect(redacted.channel).toBe("sales");
  });

  it("writes provider errors in its own words", () => {
    const error = new ProviderError("Slack access was removed or changed. Reconnect Slack to keep posting.", "auth");
    expect(looksLikeSecret(error.message)).toBe(false);
  });
});

describe("connection cards", () => {
  const view = (patch: Partial<Parameters<typeof describeConnection>[0]> = {}) => ({
    kind: "slack" as const,
    status: "active" as const,
    accountLabel: "Acme",
    externalAccountId: "T1",
    destinationId: null,
    destinationLabel: null,
    lastError: null,
    lastVerifiedAt: null,
    ...patch,
  });

  it("walks connect, choose, ready", () => {
    expect(describeConnection(view({ status: "missing" }), true).step).toBe("connect");
    expect(describeConnection(view(), true)).toMatchObject({ step: "choose", title: "Connected to Acme" });
    expect(describeConnection(view({ destinationId: "C1", destinationLabel: "#sales" }), true)).toMatchObject({
      step: "ready",
      title: "Posting to #sales",
    });
    expect(describeConnection(view({ kind: "google_drive", destinationId: "F", destinationLabel: "Vistrial" }), true).title).toBe(
      "Filing into Vistrial"
    );
  });

  it("shows a broken connection in plain language with a way back", () => {
    const state = describeConnection(view({ status: "broken", lastError: "Slack access was removed or changed. Reconnect Slack to keep posting." }), true);
    expect(state).toMatchObject({ step: "reconnect", tone: "warning", title: "Needs attention" });
    expect(describeConnection(view({ status: "broken" }), true).detail).toMatch(/Reconnect/);
  });

  it("says plainly when this deployment has no app credentials", () => {
    expect(describeConnection(view({ status: "missing" }), false)).toMatchObject({ step: "unavailable" });
  });

  it("only ever shows fixed text after an OAuth round trip", () => {
    for (const text of Object.values(EXECUTION_FLASH_ERRORS)) expect(looksLikeSecret(text)).toBe(false);
    expect(Object.keys(EXECUTION_FLASH_ERRORS).sort()).toEqual(["oauth_denied", "oauth_failed", "oauth_invalid", "too_broad"]);
  });
});
