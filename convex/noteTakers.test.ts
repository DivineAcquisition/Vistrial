/**
 * @vitest-environment edge-runtime
 *
 * Note takers and call recordings (build step 11b): Fireflies connected with the customer's own key, which
 * never leaves the server; a call's transcript read only after the person confirms it was recorded lawfully,
 * once, and shared with Dealmaker; a HighLevel recording sent straight to Deepgram and only its words kept.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { NOT_ALLOWED } from "./lib/errors";
import { deepgramLines, firefliesRecent, firefliesTranscript, recordingPath, transcriptText } from "./lib/noteTakers";
import { NOTE_TEXT } from "./noteTakers";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const KEY = "ff_test_key_0123456789abcdef";

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

const ONE_CALL = {
  data: {
    transcript: {
      id: "t1",
      title: "Discovery call with Jordan",
      date: Date.UTC(2026, 10, 10),
      sentences: [
        { speaker_name: "Nora", text: "What made you book?" },
        { speaker_name: "Jordan", text: "We need more calls." },
        { speaker_name: "Jordan", text: "The pipeline is thin." },
      ],
    },
  },
};

type Call = { url: string; auth: string | null; body: string | null };

function stubFetch() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const auth = new Headers(init.headers).get("Authorization");
    calls.push({ url, auth, body: typeof init.body === "string" ? init.body : null });
    if (url.startsWith("https://api.fireflies.ai/")) {
      if (auth !== `Bearer ${KEY}`) return new Response("{}", { status: 401 });
      const query = JSON.parse(String(init.body)).query as string;
      if (query.includes("user")) return new Response(JSON.stringify({ data: { user: { user_id: "u1", name: "Nora Quinn" } } }));
      if (query.includes("transcripts("))
        return new Response(JSON.stringify({ data: { transcripts: [{ id: "t1", title: "Discovery call with Jordan", date: Date.UTC(2026, 10, 10), duration: 32.4 }] } }));
      return new Response(JSON.stringify(ONE_CALL));
    }
    if (url.includes("/recording")) return new Response(new Blob(["wav bytes"], { type: "audio/wav" }));
    if (url.startsWith("https://api.deepgram.com/")) {
      return new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: "x",
                    paragraphs: {
                      paragraphs: [
                        { speaker: 0, sentences: [{ text: "Hi Jordan." }] },
                        { speaker: 1, sentences: [{ text: "Hi, thanks for calling." }] },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        }),
      );
    }
    return new Response("{}", { status: 404 });
  });
  return calls;
}

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
  const member = t.withIdentity(person("milo"));
  await member.mutation(api.workspace.acceptInvite, { token: invite.token });
  await t.run(async (ctx) => {
    const now = Date.now();
    const connectionId = await ctx.db.insert("crmConnections", {
      workspaceId,
      provider: "highlevel",
      status: "connected",
      accessToken: "hl-token",
      refreshToken: "refresh",
      tokenExpiresAt: now + 30 * DAY,
      scopes: [],
      accountId: "loc1",
      accountName: "Northlight",
      currency: "USD",
      connectedBy: "nora",
      connectedAt: now,
      lastSyncAt: now,
      callsOk: 0,
      callsFailed: 0,
    });
    await ctx.db.insert("crmContacts", { workspaceId, connectionId, seenAt: now, externalId: "c1", name: "Jordan Lee", tags: [], addedAt: now - DAY });
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "msg1", kind: "call", direction: "outbound", at: now - DAY, contactId: "c1", seconds: 900, status: "completed" });
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "msg2", kind: "call", direction: "outbound", at: now - DAY, contactId: "c1", seconds: 10, status: "completed" });
  });
  return { t, owner, member, workspaceId };
}

describe("note taker rules", () => {
  it("reads Fireflies' answers and writes turns, and reads Deepgram's speakers", () => {
    expect(firefliesRecent({ data: { transcripts: [{ id: "t1", title: "Call", date: "1762732800000", duration: 32.4 }, { title: "no id" }] } })).toEqual([
      { id: "t1", title: "Call", at: 1762732800000, minutes: 32 },
    ]);
    expect(transcriptText(firefliesTranscript(ONE_CALL)!.lines)).toBe("Nora: What made you book?\nJordan: We need more calls. The pipeline is thin.");
    expect(deepgramLines({ results: { channels: [{ alternatives: [{ transcript: "Plain words." }] }] } })).toEqual([{ speaker: "Call", words: "Plain words." }]);
    expect(recordingPath("msg 1", "loc1")).toBe("/conversations/messages/msg%201/locations/loc1/recording");
  });
});

describe("note takers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("connects Fireflies with the customer's key, for an Owner or Admin only, and never shows the key", async () => {
    stubFetch();
    const { owner, member, workspaceId } = await setup();
    expect(await message(member.action(api.noteTakers.connectFireflies, { workspaceId, apiKey: KEY }))).toBe(NOT_ALLOWED);
    expect(await message(owner.action(api.noteTakers.connectFireflies, { workspaceId, apiKey: "ff_wrong_key_0123456789" }))).toBe(NOTE_TEXT.badKey);
    expect(await owner.action(api.noteTakers.connectFireflies, { workspaceId, apiKey: KEY })).toEqual({ accountLabel: "Nora Quinn" });
    const status = await owner.query(api.noteTakers.status, { workspaceId });
    expect(status.fireflies).toEqual({ connected: true, accountLabel: "Nora Quinn" });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  it("imports a chosen Fireflies call once, only with consent, shared with Dealmaker", async () => {
    stubFetch();
    const { t, owner, member, workspaceId } = await setup();
    await owner.action(api.noteTakers.connectFireflies, { workspaceId, apiKey: KEY });
    expect(await member.action(api.noteTakers.firefliesCalls, { workspaceId })).toEqual([{ id: "t1", title: "Discovery call with Jordan", at: Date.UTC(2026, 10, 10), minutes: 32, imported: false }]);
    expect(await message(member.action(api.noteTakers.importFireflies, { workspaceId, firefliesId: "t1", consentConfirmed: false }))).toBe(NOTE_TEXT.consent);
    const id = await member.action(api.noteTakers.importFireflies, { workspaceId, firefliesId: "t1", consentConfirmed: true });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      title: "Discovery call with Jordan",
      tool: "Fireflies",
      callDate: "2026-11-10",
      sourceRef: "fireflies:t1",
      agents: ["sales-conversion"],
      text: "Nora: What made you book?\nJordan: We need more calls. The pipeline is thin.",
    });
    expect(await message(member.action(api.noteTakers.importFireflies, { workspaceId, firefliesId: "t1", consentConfirmed: true }))).toBe(NOTE_TEXT.already);
    expect((await member.action(api.noteTakers.firefliesCalls, { workspaceId }))[0].imported).toBe(true);
  });

  it("transcribes a HighLevel recording through Deepgram, keeping only the words, linked to the lead", async () => {
    const calls = stubFetch();
    const { t, member, workspaceId } = await setup();
    let status = await member.query(api.noteTakers.status, { workspaceId });
    // Calls shorter than half a minute are not offered.
    expect(status.recordings.map((row) => row.ref)).toEqual(["msg1"]);
    expect(status.recordings[0]).toMatchObject({ leadName: "Jordan Lee", minutes: 15, imported: false });
    expect(await message(member.action(api.noteTakers.transcribeRecording, { workspaceId, messageRef: "msg1", consentConfirmed: true }))).toBe(NOTE_TEXT.deepgramOff);

    vi.stubEnv("DEEPGRAM_API_KEY", "dg-key");
    expect(await message(member.action(api.noteTakers.transcribeRecording, { workspaceId, messageRef: "msg2", consentConfirmed: true }))).toBe(NOTE_TEXT.notFound);
    const id = await member.action(api.noteTakers.transcribeRecording, { workspaceId, messageRef: "msg1", consentConfirmed: true });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      title: "Call with Jordan Lee",
      tool: "HighLevel call recording",
      crmContactRef: "c1",
      sourceRef: "highlevel:msg1",
      agents: ["sales-conversion"],
      text: "Speaker 1: Hi Jordan.\nSpeaker 2: Hi, thanks for calling.",
    });
    expect(calls.find((call) => call.url.includes("/recording"))).toMatchObject({
      url: "https://services.leadconnectorhq.com/conversations/messages/msg1/locations/loc1/recording",
      auth: "Bearer hl-token",
    });
    expect(calls.find((call) => call.url.startsWith("https://api.deepgram.com/"))?.auth).toBe("Token dg-key");
    // Nothing but the words was stored.
    expect(await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length)).toBe(0);
    status = await member.query(api.noteTakers.status, { workspaceId });
    expect(status.recordings[0].imported).toBe(true);
  });
});
