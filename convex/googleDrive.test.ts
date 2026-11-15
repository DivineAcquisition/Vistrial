/**
 * @vitest-environment edge-runtime
 *
 * Google Drive, files the customer picks (drive.file): which files are read and how, picking by Owner or Admin
 * only, a file the connection cannot open refused, read tools limited to the agent's granted files, research
 * citing them as "Your file", a picked file added as a transcript only with consent, and everything deleted
 * on disconnect. Google's API is stubbed.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DRIVE, cleanText, pieceOf, readPlan } from "./lib/integrations/google/drive";
import { driveTools } from "./lib/integrations/google/driveTools";
import { driveFileUrl, saveDriveSourcesFor } from "./lib/integrations/google/research";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 15, 15);
const DAY = 86_400_000;
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

const DOC = "1AbCdEfGhIjKlMnOpQrStUv";
const PDF = "2AbCdEfGhIjKlMnOpQrStUv";
const STRANGER = "3AbCdEfGhIjKlMnOpQrStUv";

describe("Drive rules", () => {
  it("reads Docs, Sheets and Slides by export and small text files directly, and refuses the rest", () => {
    const doc = readPlan({ mimeType: "application/vnd.google-apps.document" });
    expect(doc.ok && doc.url("X")).toBe("https://www.googleapis.com/drive/v3/files/X/export?mimeType=text%2Fplain");
    const sheet = readPlan({ mimeType: "application/vnd.google-apps.spreadsheet" });
    expect(sheet.ok && sheet.kind).toBe("sheet");
    expect(readPlan({ mimeType: "text/markdown", size: "1000" })).toMatchObject({ ok: true, kind: "text" });
    expect(readPlan({ mimeType: "text/plain", size: String(DRIVE.maxBytes + 1) })).toEqual({ ok: false, reason: "too_large" });
    expect(readPlan({ mimeType: "application/pdf" })).toEqual({ ok: false, reason: "unsupported" });
    expect(readPlan({ mimeType: "application/vnd.google-apps.document", trashed: true })).toEqual({ ok: false, reason: "trashed" });
    expect(cleanText("Line one\r\n\r\n\r\n\r\nLine   two\t\t")).toBe("Line one\n\nLine two");
    expect(driveFileUrl({ fileId: "F", kind: "slides" })).toBe("https://docs.google.com/presentation/d/F");
  });

  it("gives read tools over the granted files only, in pieces", async () => {
    const long = "x".repeat(DRIVE.piece + 5);
    const tools = driveTools([{ id: "f1", name: "Sales script", kind: "doc", words: 1, text: long }]);
    expect(tools.map((tool) => tool.name)).toEqual(["list_picked_files", "read_picked_file"]);
    expect(JSON.parse(await tools[0].run({}))).toEqual([{ id: "f1", name: "Sales script", kind: "Google Doc", words: 1 }]);
    const first = JSON.parse(await tools[1].run({ id: "f1" }));
    expect(first.next).toBe(DRIVE.piece);
    expect(JSON.parse(await tools[1].run({ id: "f1", start: first.next })).text).toBe("xxxxx");
    await expect(tools[1].run({ id: "someone-else" })).rejects.toThrow();
    expect(driveTools([])).toEqual([]);
    expect(pieceOf("abc", 99)).toEqual({ piece: "", next: null });
  });
});

describe("a Google Drive connection", () => {
  let urls: string[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    urls = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? "GET"} ${input}`);
      const url = new URL(input);
      if (url.hostname === "oauth2.googleapis.com") return new Response("{}", { status: 200 });
      if (url.pathname.endsWith(`/${DOC}`)) return Response.json({ id: DOC, name: "Discovery call script", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-11-10T10:00:00Z" });
      if (url.pathname.endsWith(`/${DOC}/export`)) return new Response("Ask what a full calendar is worth.\r\n\r\n\r\nThen ask who decides.");
      if (url.pathname.endsWith(`/${PDF}`)) return Response.json({ id: PDF, name: "Brochure.pdf", mimeType: "application/pdf" });
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function setup() {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("dana"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    await t.run((ctx) =>
      ctx.db.insert("integrationConnections", {
        workspaceId,
        provider: "google_drive",
        status: "connected",
        accessToken: "drive-token",
        tokenExpiresAt: NOW + DAY,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
        accountId: "sub-1",
        accountLabel: "dana@example.com",
        connectedBy: "dana",
        connectedAt: NOW,
      }),
    );
    return { t, owner, member, workspaceId };
  }

  it("adds picked files an Owner chose, refuses ones it cannot read, and never writes to Drive", async () => {
    const { owner, member, workspaceId } = await setup();
    await expect(member.action(api.googleDrive.addPicked, { workspaceId, fileIds: [DOC] })).rejects.toThrow();
    await expect(owner.action(api.googleDrive.addPicked, { workspaceId, fileIds: ["../etc"] })).rejects.toThrow(/Pick between/);
    const result = await owner.action(api.googleDrive.addPicked, { workspaceId, fileIds: [DOC, PDF, STRANGER] });
    expect(result.added).toEqual(["Discovery call script"]);
    expect(result.refused.map((row) => row.why)).toEqual([
      expect.stringContaining("Open a PDF or Word file in Google Docs first"),
      expect.stringContaining("Pick it with the Google account Drive is connected as"),
    ]);
    const list = await member.query(api.googleDrive.list, { workspaceId });
    expect(list).toMatchObject({ canPick: false, canEdit: true, accountEmail: "dana@example.com" });
    expect(list!.files).toEqual([expect.objectContaining({ name: "Discovery call script", kindWord: "Google Doc", words: 11, agents: ["growth-architect", "sales-conversion"] })]);
    expect(list!.files[0]).not.toHaveProperty("text");
    expect(urls.every((row) => row.startsWith("GET "))).toBe(true);
  });

  it("cites a granted file in research and gives an agent only what it was granted", async () => {
    const { t, owner, workspaceId } = await setup();
    await owner.action(api.googleDrive.addPicked, { workspaceId, fileIds: [DOC] });
    const list = await owner.query(api.googleDrive.list, { workspaceId });
    const fileId = list!.files[0].id;
    await owner.mutation(api.googleDrive.setAgentAccess, { workspaceId, driveFileId: fileId, agentSlug: "sales-conversion", granted: false });
    const seen = await t.query(internal.googleDrive.forAgent, { workspaceId, agentSlug: "sales-conversion" });
    expect(seen).toEqual([]);
    const known = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("agentRuns", {
        workspaceId,
        agentSlug: "growth-architect",
        skillSlug: "market-intelligence",
        status: "running",
        startedBy: "dana",
        inputRef: "market-intelligence",
        startedAt: NOW,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
      const projectId = await ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Market",
        objective: "",
        market: "",
        geography: "",
        competitors: [],
        platforms: ["customerData"],
        suppliedUrls: [],
        status: "draft",
        createdBy: "dana",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const project = (await ctx.db.get(projectId))!;
      return {
        strategist: await saveDriveSourcesFor(ctx, { workspaceId, project, runId: runId as Id<"agentRuns">, agentSlug: "growth-architect" }),
        dealmaker: await saveDriveSourcesFor(ctx, { workspaceId, project, runId: runId as Id<"agentRuns">, agentSlug: "sales-conversion" }),
        sources: await ctx.db.query("sourceRefs").collect(),
      };
    });
    expect(known.strategist.map((row) => row.label)).toEqual(["Your file: Discovery call script"]);
    expect(known.dealmaker).toEqual([]);
    expect(known.sources[0]).toMatchObject({ platform: "customerData", url: `https://docs.google.com/document/d/${DOC}` });
  });

  it("adds a picked file as a call transcript only with consent", async () => {
    const { t, owner, workspaceId } = await setup();
    await owner.action(api.googleDrive.addPicked, { workspaceId, fileIds: [DOC] });
    const fileId = (await owner.query(api.googleDrive.list, { workspaceId }))!.files[0].id;
    await expect(owner.mutation(api.googleDrive.useAsTranscript, { workspaceId, driveFileId: fileId, consentConfirmed: false })).rejects.toThrow(/recorded lawfully/);
    await owner.mutation(api.googleDrive.useAsTranscript, { workspaceId, driveFileId: fileId, consentConfirmed: true });
    const transcripts = await t.run((ctx) => ctx.db.query("callTranscripts").collect());
    expect(transcripts).toEqual([expect.objectContaining({ title: "Discovery call script", tool: "Google Drive" })]);
  });

  it("deletes every picked file and the token on disconnect", async () => {
    const { t, owner, workspaceId } = await setup();
    await owner.action(api.googleDrive.addPicked, { workspaceId, fileIds: [DOC] });
    await owner.action(api.integrationActions.disconnect, { workspaceId, provider: "google_drive" });
    expect(await owner.query(api.googleDrive.list, { workspaceId })).toBeNull();
    const left = await t.run(async (ctx) => ({ files: await ctx.db.query("driveFiles").collect(), connections: await ctx.db.query("integrationConnections").collect() }));
    expect(left).toEqual({ files: [], connections: [] });
    expect(urls.at(-1)).toBe("POST https://oauth2.googleapis.com/revoke");
  });
});
