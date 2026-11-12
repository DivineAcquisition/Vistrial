/**
 * @vitest-environment edge-runtime
 *
 * Copying material from one of an Owner's organizations into another: who may, what may be copied, what
 * the copy is, and how an agent sees it.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { readBusinessContext } from "./lib/businessContext";
import { MAX_REFERENCE_CHARS, REFERENCE_HEADING } from "./lib/sharedReferences";
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

type AssetOptions = { kind?: "marketReport" | "offerAnalysis" | "adCopySet"; status?: "approved" | "draft"; clientId?: Id<"clients">; body?: string | null };

async function asset(t: Tester, workspaceId: Id<"workspaces">, title: string, options: AssetOptions = {}) {
  return t.run(async (ctx) => {
    const assetId = await ctx.db.insert("assets", {
      workspaceId,
      ...(options.clientId ? { clientId: options.clientId } : {}),
      kind: options.kind ?? "marketReport",
      title,
      status: options.status ?? "approved",
      currentVersion: 2,
      createdAt: Date.now(),
    });
    await ctx.db.insert("assetVersions", { workspaceId, assetId, version: 1, body: `OLD ${title}`, createdBy: "agent" });
    if (options.body !== null) await ctx.db.insert("assetVersions", { workspaceId, assetId, version: 2, body: options.body ?? `# ${title}\n\nCoaches buy on referral.`, createdBy: "agent" });
    return assetId;
  });
}

/** An agency with two organizations of its own, and a second, unrelated agency. */
async function world(t: Tester) {
  const owner = t.withIdentity(person("nora"));
  const growth = await owner.mutation(api.workspace.create, { name: "Northlight Growth" });
  const accountId = (await t.run((ctx) => ctx.db.get(growth)))!.accountId!;
  const coaching = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
  const other = t.withIdentity(person("ben"));
  const beacon = await other.mutation(api.workspace.create, { name: "Beacon Coaching" });
  const join = async (subject: string, role: "admin" | "member" | "viewer", workspaceId: Id<"workspaces">) => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  return { owner, growth, coaching, other, beacon, join };
}

describe("copying material into another organization", () => {
  it("offers an Owner the approved reports and offer analyses of their other organizations, and nothing made for a client", async () => {
    const t = newTest();
    const { owner, growth, coaching, beacon, join } = await world(t);
    const report = await asset(t, growth, "Market report: coaches");
    await asset(t, growth, "Offer analysis: retainer", { kind: "offerAnalysis" });
    await asset(t, growth, "Still a draft", { status: "draft" });
    await asset(t, growth, "Ad copy", { kind: "adCopySet" });
    await asset(t, growth, "No written version", { body: null });
    const clientId = await owner.mutation(api.clients.create, { workspaceId: growth, type: "business", name: "Harbor Dental Group" });
    await asset(t, growth, "Harbor Dental report", { clientId });
    await asset(t, beacon, "Beacon secret report");

    const sources = await owner.query(api.sharedReferences.sources, { workspaceId: coaching });
    expect(sources.map((row) => row.name)).toEqual(["Northlight Growth"]);
    expect(sources[0].items.map((row) => row.title).sort()).toEqual(["Market report: coaches", "Offer analysis: retainer"]);
    expect(sources[0].items.find((row) => row.assetId === report)).toMatchObject({ kind: "Market report", copied: false });

    const admin = await join("ada", "admin", coaching);
    expect(await message(admin.query(api.sharedReferences.sources, { workspaceId: coaching }))).toBe("Not allowed.");
  });

  it("copies a snapshot that is labelled, read-only here, and untouched by later changes to the original", async () => {
    const t = newTest();
    const { owner, growth, coaching } = await world(t);
    const report = await asset(t, growth, "Market report: coaches");
    const referenceId = await owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: report });

    const listed = await owner.query(api.sharedReferences.list, { workspaceId: coaching });
    expect(listed.items).toEqual([expect.objectContaining({ id: referenceId, title: "Market report: coaches", kind: "Market report", fromName: "Northlight Growth", copiedByName: "nora", cut: false })]);
    expect(await owner.query(api.sharedReferences.get, { workspaceId: coaching, referenceId })).toMatchObject({ body: "# Market report: coaches\n\nCoaches buy on referral.", fromName: "Northlight Growth" });
    expect((await owner.query(api.sharedReferences.sources, { workspaceId: coaching }))[0].items[0].copied).toBe(true);
    expect(await message(owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: report }))).toContain("already copied");

    // The original gets a new version and a new name; the copy does not move.
    await t.run(async (ctx) => {
      await ctx.db.insert("assetVersions", { workspaceId: growth, assetId: report, version: 3, body: "REWRITTEN", createdBy: "person" });
      await ctx.db.patch(report, { currentVersion: 3, title: "Renamed" });
      await ctx.db.patch(growth, { name: "Northlight Growth Ltd" });
    });
    expect(await owner.query(api.sharedReferences.get, { workspaceId: coaching, referenceId })).toMatchObject({ title: "Market report: coaches", fromName: "Northlight Growth", body: expect.stringContaining("referral") });
    // Nothing was written into the organization it came from, except the record that it left.
    expect((await owner.query(api.sharedReferences.list, { workspaceId: growth })).items).toEqual([]);
    const audit = (workspaceId: Id<"workspaces">) => t.run(async (ctx) => (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).map((row) => row.action));
    expect(await audit(coaching)).toContain("reference.copied_in");
    expect(await audit(growth)).toContain("reference.copied_out");
  });

  it("refuses anything but an approved report or offer analysis that was not made for a client", async () => {
    const t = newTest();
    const { owner, growth, coaching } = await world(t);
    const clientId = await owner.mutation(api.clients.create, { workspaceId: growth, type: "business", name: "Harbor Dental Group" });
    const copy = (assetId: Id<"assets">) => message(owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId }));
    expect(await copy(await asset(t, growth, "Harbor Dental report", { clientId }))).toContain("not made for a client");
    expect(await copy(await asset(t, growth, "Still a draft", { status: "draft" }))).toContain("Only an approved report");
    expect(await copy(await asset(t, growth, "Ad copy", { kind: "adCopySet" }))).toContain("Only an approved report");
    expect(await copy(await asset(t, growth, "No written version", { body: null }))).toContain("no written version");
    const long = await asset(t, growth, "Very long", { body: "x".repeat(MAX_REFERENCE_CHARS + 500) });
    const referenceId = await owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: long });
    expect((await owner.query(api.sharedReferences.get, { workspaceId: coaching, referenceId })).body).toHaveLength(MAX_REFERENCE_CHARS);
    expect((await owner.query(api.sharedReferences.list, { workspaceId: coaching })).items[0].cut).toBe(true);
  });

  it("is closed to everyone but an Owner of both organizations, and never crosses accounts", async () => {
    const t = newTest();
    const { owner, growth, coaching, other, beacon, join } = await world(t);
    const report = await asset(t, growth, "Market report: coaches");
    const beaconReport = await asset(t, beacon, "Beacon secret report");
    const admin = await join("ada", "admin", coaching);
    await join("ada", "admin", growth);
    expect(await message(admin.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: report }))).toBe("Not allowed.");
    // Another account's organization, and another account's document, do not exist to this Owner.
    expect(await message(owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: beacon, assetId: beaconReport }))).toBe("Not found.");
    expect(await message(owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: beaconReport }))).toBe("Not found.");
    // The other agency's Owner cannot pull from here, and cannot read what was copied here.
    expect(await message(other.mutation(api.sharedReferences.copy, { workspaceId: beacon, fromWorkspaceId: growth, assetId: report }))).toBe("Not found.");
    const referenceId = await owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: report });
    expect(await message(other.query(api.sharedReferences.get, { workspaceId: beacon, referenceId }))).toBe("Not found.");
    expect(await message(other.query(api.sharedReferences.list, { workspaceId: coaching }))).toBe("Not found.");
  });

  it("can be read by people who see the organization's own work, removed by an Owner or Admin, and copied from an archived organization", async () => {
    const t = newTest();
    const { owner, growth, coaching, join } = await world(t);
    const report = await asset(t, coaching, "Coaching offer analysis", { kind: "offerAnalysis" });
    // The source is archived; its material can still be taken into an active organization, but not the other way.
    await owner.mutation(api.organizations.archive, { workspaceId: coaching, confirmName: "Northlight Coaching" });
    const referenceId = await owner.mutation(api.sharedReferences.copy, { workspaceId: growth, fromWorkspaceId: coaching, assetId: report });
    expect((await owner.query(api.sharedReferences.sources, { workspaceId: growth }))[0]).toMatchObject({ name: "Northlight Coaching", archived: true });
    const back = await asset(t, growth, "Growth report");
    expect(await message(owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: back }))).toContain("archived");

    const member = await join("mo", "member", growth);
    const viewer = await join("vera", "viewer", growth);
    expect((await member.query(api.sharedReferences.list, { workspaceId: growth })).items).toHaveLength(1);
    expect(await member.query(api.sharedReferences.list, { workspaceId: growth })).toMatchObject({ canCopy: false, canRemove: false });
    // Someone kept away from the organization's own work does not see it.
    const people = await owner.query(api.settings.people, { workspaceId: growth });
    await owner.mutation(api.clients.setOwnWork, { workspaceId: growth, memberId: people.members.find((row) => row.email === "vera@example.com")!.id as Id<"members">, ownWork: false });
    expect((await viewer.query(api.sharedReferences.list, { workspaceId: growth })).items).toEqual([]);
    expect(await message(viewer.query(api.sharedReferences.get, { workspaceId: growth, referenceId }))).toBe("Not found.");

    expect(await message(member.mutation(api.sharedReferences.remove, { workspaceId: growth, referenceId }))).toBe("Not allowed.");
    const admin = await join("ada", "admin", growth);
    await admin.mutation(api.sharedReferences.remove, { workspaceId: growth, referenceId });
    expect((await owner.query(api.sharedReferences.list, { workspaceId: growth })).items).toEqual([]);
    // The original is still where it was.
    expect(await t.run((ctx) => ctx.db.get(report))).toMatchObject({ title: "Coaching offer analysis" });
  });

  it("reaches an agent as labelled reference, not as this business's facts, and not at all in work for a client", async () => {
    const t = newTest();
    const { owner, growth, coaching } = await world(t);
    const report = await asset(t, growth, "Market report: coaches");
    await owner.mutation(api.sharedReferences.copy, { workspaceId: coaching, fromWorkspaceId: growth, assetId: report });
    const clientId = await owner.mutation(api.clients.create, { workspaceId: coaching, type: "person", name: "Dana Whitfield" });
    const known = (forClient: boolean, workspaceId = coaching) =>
      t.run(async (ctx) => {
        const runId = await ctx.db.insert("agentRuns", { workspaceId, ...(forClient ? { clientId } : {}), agentSlug: "growth-architect", skillSlug: "offer-intelligence", status: "running", startedBy: "nora", inputRef: "x", startedAt: 0, costCents: 0, inputTokens: 0, outputTokens: 0 });
        const context = await readBusinessContext(ctx, (await ctx.db.get(runId))!, null);
        return context.known.filter((row) => row.origin === "reference");
      });
    const own = await known(false);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ label: `${REFERENCE_HEADING}: "Market report: coaches", from Northlight Growth`, status: "reference", value: expect.stringContaining("Coaches buy on referral.") });
    expect(await known(true)).toEqual([]);
    // The organization it came from is told nothing new about itself.
    expect(await known(false, growth)).toEqual([]);
  });
});
