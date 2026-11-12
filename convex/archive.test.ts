/**
 * @vitest-environment edge-runtime
 *
 * Archiving an organization and exporting its data: who may, what stops working, what the export holds
 * and what it never does.
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ARCHIVED_WORDS } from "./lib/builders";
import { EXPORT_TABLES, exportFiles, exportable } from "./lib/exportShape";
import { crc32, safeName, zip } from "./lib/zip";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const newTest = () => convexTest(schema, modules);
type Tester = ReturnType<typeof newTest>;

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

/** An agency with its first organization and a second one, and an Admin and a Member in the second. */
async function agency(t: Tester, ownerId = "nora") {
  const owner = t.withIdentity(person(ownerId));
  const first = await owner.mutation(api.workspace.create, { name: "Northlight Growth" });
  const accountId = (await t.run((ctx) => ctx.db.get(first)))!.accountId!;
  const second = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
  const join = async (subject: string, role: "admin" | "member" | "viewer") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId: second, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  return { owner, first, second, accountId, join };
}

/** The files inside a stored (uncompressed) zip, read back by its own headers. */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const data = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(crc32(data)).toBe(view.getUint32(offset + 14, true));
    files.set(name, decoder.decode(data));
    offset += 30 + nameLength + size;
  }
  expect(view.getUint32(offset, true)).toBe(0x02014b50);
  expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(files.size);
  return files;
}

describe("the zip an export is written as", () => {
  it("computes the standard checksum and reads back what was put in", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const files = unzip(zip([{ path: "a.txt", text: "héllo" }, { path: "data/b.json", text: "{}" }, { path: "a.txt", text: "second" }]));
    expect([...files.keys()]).toEqual(["a.txt", "data/b.json", "a (2).txt"]);
    expect(files.get("a.txt")).toBe("héllo");
    expect(files.get("a (2).txt")).toBe("second");
  });

  it("makes names that cannot leave their folder", () => {
    expect(safeName("../../etc/passwd")).toBe("etc passwd");
    expect(safeName("  Q3: plan / review?  ")).toBe("Q3 plan review");
    expect(safeName("///", "report")).toBe("report");
  });
});

describe("what an export holds", () => {
  it("drops credentials, stored file ids and who a person is, at any depth", () => {
    const out = exportable({
      _id: "a1",
      workspaceId: "w1",
      title: "Call with Dana",
      addedBy: "user_1",
      accessToken: "secret-token",
      nested: { refreshToken: "x", logo: { storageId: "s1", name: "logo.png" }, list: [{ userId: "u", note: "kept" }] },
      contactEmail: "dana@example.com",
    });
    expect(out).toEqual({ _id: "a1", title: "Call with Dana", nested: { logo: { name: "logo.png" }, list: [{ note: "kept" }] } });
  });

  it("writes every table as JSON, reports as Markdown, transcripts as text, and a README that says what is missing", () => {
    const files = exportFiles({
      organization: { name: "Northlight Coaching", exportedAt: Date.UTC(2026, 10, 12) },
      tables: { assets: [{ _id: "as1", title: "Market report: coaches", currentVersion: 2 }], callTranscripts: [{ title: "Dana", callDate: "2026-11-01", text: "Hello." }] },
      assetVersions: [{ assetId: "as1", version: 1, body: "old" }, { assetId: "as1", version: 2, body: "# Report" }],
      offerVersions: [],
      brandKitVersions: [],
      cut: ["assets"],
    });
    const byPath = new Map(files.map((file) => [file.path, file.text]));
    for (const { file } of EXPORT_TABLES) expect(byPath.has(`data/${file}.json`)).toBe(true);
    expect(byPath.get("reports/Market report coaches.md")).toBe("# Report");
    expect(byPath.get("transcripts/2026-11-01 Dana.txt")).toBe("Hello.");
    expect(byPath.get("README.txt")).toContain("Northlight Coaching: export from Vistrial, 2026-11-12");
    expect(byPath.get("README.txt")).toContain("connected accounts and their tokens");
    expect(byPath.get("README.txt")).toContain("Cut short");
  });
});

describe("archiving an organization", () => {
  it("is for an Owner only, needs the name typed, and never the account's first organization", async () => {
    const t = newTest();
    const { owner, first, second, join } = await agency(t);
    const admin = await join("ada", "admin");
    expect(await message(admin.mutation(api.organizations.archive, { workspaceId: second, confirmName: "Northlight Coaching" }))).toBe("Not allowed.");
    expect(await message(owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: "wrong" }))).toContain("Type the organization's name");
    expect(await message(owner.mutation(api.organizations.archive, { workspaceId: first, confirmName: "Northlight Growth" }))).toContain("first organization");
    expect(await owner.query(api.organizations.archiveState, { workspaceId: first })).toMatchObject({ canArchive: false, archived: false });
    expect(await owner.query(api.organizations.archiveState, { workspaceId: second })).toMatchObject({ canArchive: true, archived: false });
    expect(await admin.query(api.organizations.archiveState, { workspaceId: second })).toMatchObject({ canArchive: false, isOwner: false });

    await owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: " northlight coaching " });
    const row = await t.run((ctx) => ctx.db.get(second));
    expect(row).toMatchObject({ status: "archived", archivedBy: "nora" });
    const audit = await t.run(async (ctx) => (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", second)).collect()).map((entry) => entry.action));
    expect(audit).toContain("organization.archived");
  });

  it("leaves the selector's list, stays readable, and refuses changes in plain words", async () => {
    const t = newTest();
    const { owner, second, join } = await agency(t);
    const admin = await join("ada", "admin");
    const member = await join("mo", "member");
    await owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: "Northlight Coaching" });

    const mine = await owner.query(api.organizations.mine, {});
    expect(mine.organizations.map((row) => row.name)).toEqual(["Northlight Growth"]);
    expect(mine.archived.map((row) => row.name)).toEqual(["Northlight Coaching"]);
    // Someone who is not an Owner no longer has it listed at all.
    expect(await admin.query(api.organizations.mine, {})).toMatchObject({ organizations: [], archived: [] });

    // Reading still works, for everyone who could read before.
    expect((await member.query(api.workspace.shell, { workspaceId: second })).role).toBe("member");
    expect(await owner.query(api.organizations.archiveState, { workspaceId: second })).toMatchObject({ archived: true, canRestore: true });

    expect(await message(admin.mutation(api.settings.renameWorkspace, { workspaceId: second, name: "New name" }))).toBe(ARCHIVED_WORDS);
    expect(await message(owner.mutation(api.workspace.invite, { workspaceId: second, email: "x@example.com", role: "viewer" }))).toBe(ARCHIVED_WORDS);
    expect(await message(member.mutation(api.clients.create, { workspaceId: second, type: "business", name: "Acme" } as never))).not.toBe("ran");
  });

  it("stops runs that were open", async () => {
    const t = newTest();
    const { owner, second } = await agency(t);
    const runId = await t.run(async (ctx) => {
      return ctx.db.insert("agentRuns", { workspaceId: second, agentSlug: "growth-architect", skillSlug: "test-echo", status: "running", startedBy: "nora", inputRef: "test-echo", startedAt: 0, costCents: 0, inputTokens: 0, outputTokens: 0 });
    });
    await owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: "Northlight Coaching" });
    expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({ status: "stopped", stopReason: "cancelled" });
  });

  it("can be brought back by an Owner, and only by an Owner", async () => {
    const t = newTest();
    const { owner, second, join } = await agency(t);
    const admin = await join("ada", "admin");
    await owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: "Northlight Coaching" });
    expect(await message(admin.mutation(api.organizations.restore, { workspaceId: second }))).toBe("Not allowed.");
    await owner.mutation(api.organizations.restore, { workspaceId: second });
    expect((await owner.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth", "Northlight Coaching"]);
    await admin.mutation(api.settings.renameWorkspace, { workspaceId: second, name: "Northlight Coaching Co" });
    const audit = await t.run(async (ctx) => (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", second)).collect()).map((entry) => entry.action));
    expect(audit).toEqual(expect.arrayContaining(["organization.archived", "organization.restored"]));
  });

  it("refuses every organization mutation while archived, even for the Owner, whatever is added later", async () => {
    /** A person's own choices, and the two things an Owner does to an archived organization. */
    const OPEN = new Set(["settings:rememberMe", "settings:setMyPreferences", "agentWaitlist:toggle", "collections:create", "collections:rename", "collections:remove", "collections:addItem", "collections:removeItem", "briefing:markSeen", "home:visit", "personalNotes:add", "personalNotes:update", "personalNotes:remove", "organizations:restore", "exports:start"]);
    type Registered = { isPublic?: boolean; isMutation?: boolean; exportArgs?: () => string; _handler?: (ctx: MutationCtx, args: unknown) => Promise<unknown> };
    const mutations: { name: string; fn: Registered }[] = [];
    for (const [path, load] of Object.entries(modules)) {
      if (path.includes("/_generated/")) continue;
      for (const [name, value] of Object.entries((await load()) as Record<string, unknown>)) {
        const fn = value as Registered;
        if (typeof value !== "function" || !fn.isPublic || !fn.isMutation || !fn._handler) continue;
        if (!JSON.parse(fn.exportArgs?.() ?? "{}").value?.workspaceId) continue;
        mutations.push({ name: `${path.replace(/^\.\//, "").replace(/\.ts$/, "")}:${name}`, fn });
      }
    }
    expect(mutations.length).toBeGreaterThan(80);
    const t = newTest();
    const { owner, second } = await agency(t);
    await owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: "Northlight Coaching" });
    const wrong: string[] = [];
    await t.withIdentity(person("nora")).run(async (ctx) => {
      for (const { name, fn } of mutations) {
        if (OPEN.has(name) || name.startsWith("staff:")) continue;
        const said = await message(fn._handler!(ctx as unknown as MutationCtx, { workspaceId: second }).then(() => Promise.reject(new Error("ran"))));
        if (said !== ARCHIVED_WORDS) wrong.push(`${name} → ${said.slice(0, 60)}`);
      }
    });
    expect(wrong).toEqual([]);
    expect([...OPEN].filter((name) => !mutations.some((row) => row.name === name))).toEqual([]);
  });
});

describe("exporting an organization", () => {
  async function seeded() {
    vi.useFakeTimers();
    const t = newTest();
    const made = await agency(t);
    const other = t.withIdentity(person("ben"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beacon Coaching" });
    await made.owner.mutation(api.clients.create, { workspaceId: made.second, type: "business", name: "Harbor Dental Group" });
    await made.owner.mutation(api.clients.create, { workspaceId: made.first, type: "business", name: "First-org client" });
    await other.mutation(api.clients.create, { workspaceId: otherId, type: "business", name: "Beacon secret client" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("callTranscripts", {
        workspaceId: made.second,
        title: "Discovery call",
        tool: "upload",
        callDate: "2026-11-02",
        text: "We talked about retainers.",
        words: 4,
        addedBy: "user_nora_private",
        createdAt: now,
        consentConfirmedAt: now,
      });
    });
    return { t, ...made, other, otherId };
  }

  async function download(t: Tester, storageId: Id<"_storage">) {
    const buffer = await t.run(async (ctx) => (await ctx.storage.get(storageId))!.arrayBuffer());
    return unzip(new Uint8Array(buffer));
  }

  it("is started by an Owner, built in the background, and holds this organization's work and nothing else", async () => {
    const { t, owner, second, join } = await seeded();
    const admin = await join("ada", "admin");
    expect(await message(admin.mutation(api.exports.start, { workspaceId: second }))).toBe("Not allowed.");
    expect(await message(admin.query(api.exports.list, { workspaceId: second }))).toBe("Not allowed.");

    const exportId = await owner.mutation(api.exports.start, { workspaceId: second });
    expect((await owner.query(api.exports.list, { workspaceId: second }))[0]).toMatchObject({ status: "building", url: null });
    expect(await message(owner.mutation(api.exports.start, { workspaceId: second }))).toContain("already being built");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [ready] = await owner.query(api.exports.list, { workspaceId: second });
    expect(ready).toMatchObject({ id: exportId, status: "ready" });
    expect(ready.url).toBeTruthy();
    expect(ready.records).toBe(2);
    const row = await t.run((ctx) => ctx.db.get(exportId));
    const files = await download(t, row!.storageId!);
    const everything = [...files.values()].join("\n");
    expect(files.get("transcripts/2026-11-02 Discovery call.txt")).toBe("We talked about retainers.");
    expect(everything).toContain("Harbor Dental Group");
    // Nothing of the account's other organization, nothing of another account, no person's id.
    expect(everything).not.toContain("First-org client");
    expect(everything).not.toContain("Beacon secret client");
    expect(everything).not.toContain("user_nora_private");
    expect(everything).not.toContain(second);

    const audit = await t.run(async (ctx) => (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", second)).collect()).map((entry) => entry.action));
    expect(audit).toEqual(expect.arrayContaining(["organization.export_started", "organization.exported"]));
    vi.useRealTimers();
  });

  it("works on an archived organization, and its file is removed after a week", async () => {
    const { t, owner, second } = await seeded();
    await owner.mutation(api.organizations.archive, { workspaceId: second, confirmName: "Northlight Coaching" });
    const exportId = await owner.mutation(api.exports.start, { workspaceId: second });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const row = await t.run((ctx) => ctx.db.get(exportId));
    expect(row?.status).toBe("ready");

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect((await owner.query(api.exports.list, { workspaceId: second }))[0]).toMatchObject({ status: "expired", url: null });
    const { internal } = await import("./_generated/api");
    expect(await t.mutation(internal.exports.removeExpired, {})).toBe(1);
    expect(await t.mutation(internal.exports.removeExpired, {})).toBe(0);
    expect(await t.run(async (ctx) => (await ctx.storage.get(row!.storageId!)) === null)).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(exportId)))?.status).toBe("expired");
    vi.useRealTimers();
  });
});
