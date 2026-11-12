/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ONE_OWN_KIT } from "./brandKits";
import { brandGaps, brandProblem, cleanBrand, normalHex, sameBrand, EMPTY_BRAND } from "./lib/brandKits";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string, email: string) {
  return { subject, email, name: email, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

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

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const owner = t.withIdentity(person("owner-a", "owner-a@example.com"));
  const other = t.withIdentity(person("owner-b", "owner-b@example.com"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  const otherWorkspace = await other.mutation(api.workspace.create, { name: "Beta" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "viewer-a@example.com", role: "viewer" });
  const viewer = t.withIdentity(person("viewer-a", "viewer-a@example.com"));
  await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
  const store = (type: string, bytes = 4) => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
  return { t, owner, other, viewer, workspaceId, otherWorkspace, store };
}

describe("brand kit content", () => {
  it("reads colour codes however they are typed, and names what is wrong", () => {
    expect(normalHex("ABC")).toBe("#aabbcc");
    expect(normalHex(" #1A2B3C ")).toBe("#1a2b3c");
    expect(brandProblem({ name: " " })).toBe("Give the brand a name.");
    expect(brandProblem({ name: "Alpha", colors: [{ label: "Main", hex: "blue" }] })).toContain("is not a colour code");
    expect(brandProblem({ name: "Alpha", website: "alpha.com" })).toContain("full link");
    expect(brandProblem({ name: "Alpha", regulated: "medical" })).toContain("regulated");
    expect(brandProblem({ name: "Alpha", placements: ["3:2"] })).toContain("placements");
    expect(brandProblem({ name: "Alpha", logos: [{ storageId: "s1", variant: "light", name: "logo.png" }] })).toContain("owns these logos");
    expect(brandProblem({ name: "Alpha", logos: [{ storageId: "s1", variant: "light", name: "logo.png" }], logosOwned: true })).toBeNull();
  });

  it("cleans a kit: trims, drops repeats, keeps placements in a fixed order", () => {
    const kit = cleanBrand({
      name: "  Alpha   Studio ",
      colors: [
        { label: " Main ", hex: "#ABC" },
        { label: "Again", hex: "aabbcc" },
      ],
      useWords: ["Clear", "clear", " ", "Plain"],
      placements: ["9:16", "1:1"],
      regulated: "health",
    });
    expect(kit.name).toBe("Alpha Studio");
    expect(kit.colors).toEqual([{ label: "Main", hex: "#aabbcc" }]);
    expect(kit.useWords).toEqual(["Clear", "Plain"]);
    expect(kit.placements).toEqual(["1:1", "9:16"]);
    expect(kit.regulated).toBe("health");
    // The ownership tick means nothing without a logo.
    expect(cleanBrand({ name: "Alpha", logosOwned: true }).logosOwned).toBe(false);
    expect(sameBrand(kit, { ...kit, name: " Alpha Studio" })).toBe(true);
    expect(brandGaps({ ...EMPTY_BRAND, name: "Alpha" })).toEqual(["a logo file", "brand colours", "a tone of voice", "the placements you run"]);
  });
});

describe("brand kits", () => {
  it("keeps one kit for the workspace's own brand and any number of clients, each versioned", async () => {
    const { owner, workspaceId } = await setup();
    const own = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "own", name: "Alpha Agency", tone: "Plain and direct." });
    expect(own).toMatchObject({ version: 1, added: true });
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "own", name: "Alpha Two" }))).toBe(ONE_OWN_KIT);
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, name: "No kind" }))).toContain("your own brand or a client's");

    const client = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", name: "Northside Dental", regulated: "health", colors: [{ label: "Teal", hex: "#0AA" }] });
    // The same content again adds nothing; a change adds a version and never overwrites.
    expect(await owner.mutation(api.brandKits.saveVersion, { workspaceId, kitId: client.kitId, name: "Northside Dental", regulated: "health", colors: [{ label: "Teal", hex: "#00aaaa" }] })).toMatchObject({ version: 1, added: false });
    expect(await owner.mutation(api.brandKits.saveVersion, { workspaceId, kitId: client.kitId, name: "Northside Dental", regulated: "health", tone: "Warm.", note: "Added the tone" })).toMatchObject({ version: 2, added: true });

    const kit = await owner.query(api.brandKits.get, { workspaceId, kitId: client.kitId });
    expect(kit.currentVersion).toBe(2);
    expect(kit.versions.map((row) => [row.version, row.tone, row.colors.length, row.note])).toEqual([
      [1, "", 1, null],
      [2, "Warm.", 0, "Added the tone"],
    ]);

    const list = await owner.query(api.brandKits.list, { workspaceId });
    expect(list.map((row) => [row.kind, row.name, row.versions])).toEqual([
      ["own", "Alpha Agency", 1],
      ["client", "Northside Dental", 2],
    ]);
    expect(list[0].gaps).toEqual(["a logo file", "brand colours", "the placements you run"]);

    // Putting the own kit away frees the slot; the kit itself can no longer be edited.
    await owner.mutation(api.brandKits.archive, { workspaceId, kitId: own.kitId });
    expect((await owner.query(api.brandKits.list, { workspaceId })).map((row) => row.name)).toEqual(["Northside Dental"]);
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kitId: own.kitId, name: "Alpha Agency" }))).toContain("put away");
    expect(await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "own", name: "Alpha Agency" })).toMatchObject({ version: 1, added: true });
  });

  it("takes real logo files only, with the ownership tick", async () => {
    const { t, owner, workspaceId, store } = await setup();
    const png = await store("image/png");
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", name: "Northside", logos: [{ storageId: png, variant: "light", name: "logo.png" }] }))).toContain("owns these logos");
    const saved = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", name: "Northside", logos: [{ storageId: png, variant: "light", name: "lo<go>.png" }], logosOwned: true });
    const kit = await owner.query(api.brandKits.get, { workspaceId, kitId: saved.kitId });
    expect(kit.versions[0].logos).toHaveLength(1);
    expect(kit.versions[0].logos[0]).toMatchObject({ variant: "light", name: "logo.png" });
    expect(kit.versions[0].logos[0].url).toBeTruthy();
    expect((await owner.query(api.brandKits.list, { workspaceId }))[0].logoUrl).toBeTruthy();

    const exe = await store("application/x-msdownload");
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kitId: saved.kitId, name: "Northside", logos: [{ storageId: exe, variant: "dark", name: "logo.exe" }], logosOwned: true }))).toContain("PNG, JPG, WebP or SVG");
    const big = await store("image/png", 5 * 1024 * 1024 + 1);
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kitId: saved.kitId, name: "Northside", logos: [{ storageId: big, variant: "dark", name: "big.png" }], logosOwned: true }))).toContain("over 5 MB");
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kitId: saved.kitId, name: "Northside", logos: [{ storageId: "not-a-file", variant: "dark", name: "x.png" }], logosOwned: true }))).toContain("did not finish uploading");
    // A refused save changes nothing: still one version.
    expect((await owner.query(api.brandKits.get, { workspaceId, kitId: saved.kitId })).versions).toHaveLength(1);
    void t;
  });

  it("is closed to other workspaces, and Viewers can read but not change", async () => {
    const { owner, other, viewer, workspaceId, otherWorkspace } = await setup();
    const saved = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "own", name: "Alpha Agency" });
    const kitId = saved.kitId as Id<"brandKits">;

    expect(await message(other.query(api.brandKits.list, { workspaceId }))).toBe(NOT_FOUND);
    expect(await message(other.query(api.brandKits.get, { workspaceId: otherWorkspace, kitId }))).toBe(NOT_FOUND);
    expect(await message(other.mutation(api.brandKits.saveVersion, { workspaceId: otherWorkspace, kitId, name: "Taken" }))).toBe(NOT_FOUND);
    expect(await message(other.mutation(api.brandKits.archive, { workspaceId: otherWorkspace, kitId }))).toBe(NOT_FOUND);
    expect(await other.query(api.brandKits.list, { workspaceId: otherWorkspace })).toEqual([]);

    expect((await viewer.query(api.brandKits.list, { workspaceId })).map((row) => row.name)).toEqual(["Alpha Agency"]);
    expect(await message(viewer.mutation(api.brandKits.saveVersion, { workspaceId, kitId, name: "Changed" }))).toBe(NOT_ALLOWED);
    expect(await message(viewer.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", name: "New" }))).toBe(NOT_ALLOWED);
    expect(await message(viewer.mutation(api.brandKits.archive, { workspaceId, kitId }))).toBe(NOT_ALLOWED);
    expect(await message(viewer.mutation(api.brandKits.logoUploadUrl, { workspaceId }))).toBe(NOT_ALLOWED);
  });
});
