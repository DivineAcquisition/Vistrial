/**
 * @vitest-environment edge-runtime
 *
 * The Objection Playbook's code part (Dealmaker; docs/rebuild/dealmaker.md, 0.8 and 4.5): counts per call, only
 * the buyer's words quoted, "Not enough data" below five calls, what was said back on calls that later closed,
 * per rep for the Owner only, the starter set, and adding an objection heard on a call.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MIN_CALLS, STARTER_OBJECTIONS, objectionPlaybook, titleKey, outcomeOf, reviewObjections, type HeardCall } from "./lib/dealmaker/objections";
import type { ReviewView } from "./lib/dealmaker/reviewView";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const PRICE = "price" as Id<"playbookItems">;
const PARTNER = "partner" as Id<"playbookItems">;
const items = [
  { id: PRICE, title: "It costs more than I expected", tag: "money" as const, starter: false },
  { id: PARTNER, title: "I need to talk to my partner first", tag: "trust" as const, starter: true },
];

function call(i: number, outcome: HeardCall["outcome"], objections: HeardCall["objections"], rep = "Milo"): HeardCall {
  return { id: `r${i}`, from: "review", at: 1000 + i, leadName: `Lead ${i}`, dealRef: `d${i}`, rep, outcome, objections };
}
const price = (quote: string | null, answerQuote: string | null) => ({ title: "Price is high", itemId: PRICE, quote, answered: Boolean(answerQuote), answerQuote });

describe("the Objection Playbook's figures (code)", () => {
  it("reads a review's objections: the buyer's words quoted, a rep's own line left out, no speaker counted unquoted", () => {
    const view: Pick<ReviewView, "objections"> = {
      objections: [
        { text: "Price", quote: "it feels expensive", kind: "Buyer's words", answered: true, answerQuote: "most of it is follow-up", itemId: PRICE },
        { text: "Price again", quote: "I know price is a worry", kind: "Rep's words, Milo", answered: false, answerQuote: "" },
        { text: "Timing", quote: "not this month", kind: "Said on the call (speaker not named)", answered: false, answerQuote: "" },
      ],
    };
    expect(reviewObjections(view)).toEqual([
      { title: "Price", itemId: PRICE, quote: "it feels expensive", answered: true, answerQuote: "most of it is follow-up" },
      { title: "Timing", itemId: null, quote: null, answered: false, answerQuote: null },
    ]);
    expect(titleKey("“It’s more than we budgeted.”")).toBe(titleKey("it's MORE than we  budgeted"));
    expect([outcomeOf("won"), outcomeOf("abandoned"), outcomeOf("open", "yes"), outcomeOf(null, "yes"), outcomeOf(null, "notFit"), outcomeOf(null, "thinking")]).toEqual(["won", "lost", "open", "won", "lost", "open"]);
  });

  it("counts once per call, shows quotes, and says Not enough data below five calls", () => {
    const out = objectionPlaybook({
      items,
      calls: [call(1, "won", [price("it feels expensive", "most of it is follow-up"), price("too much for us", null)]), call(2, "open", [{ title: "We use another agency", itemId: null, quote: "we already have someone", answered: false, answerQuote: null }])],
      showLeads: true,
      showReps: false,
    });
    expect(out).toMatchObject({ calls: 2, enough: false });
    expect(out.callsWords).toMatch(/^Not enough data: 2 of 5 calls/);
    const [first, second] = out.rows;
    expect(first).toMatchObject({ itemId: PRICE, heard: 1, heardWords: "Heard on 1 call", answered: { calls: 1, won: 1 }, worked: [] });
    expect(first.quotes.map((row) => [row.quote, row.leadName])).toEqual([
      ["it feels expensive", "Lead 1"],
      ["too much for us", "Lead 1"],
    ]);
    expect(first.workedWords).toMatch(/^Not enough data/);
    expect(first.reps).toBeUndefined();
    expect(second).toMatchObject({ itemId: PARTNER, heard: 0, heardWords: "Starter set: not yet heard on your calls", workedWords: "" });
    expect(out.unmatched).toEqual([{ title: "We use another agency", heard: 1, quote: "we already have someone", lastHeard: 1002, reviewId: "r2" }]);
  });

  it("from five calls, compares answered against not answered, keeps what was said on calls later won, and per rep for the Owner", () => {
    const calls = [
      call(1, "won", [price("q1", "most of it is follow-up")]),
      call(2, "won", [price("q2", "you keep the system after")], "Ana"),
      call(3, "lost", [price("q3", null)]),
      call(4, "open", [price("q4", "most of it is follow-up")]),
      call(5, "lost", [{ title: "I need to talk to my partner first", itemId: null, quote: null, answered: false, answerQuote: null }]),
    ];
    expect(calls).toHaveLength(MIN_CALLS);
    const out = objectionPlaybook({ items, calls, showLeads: false, showReps: true });
    const row = out.rows[0];
    expect(row.workedWords).toBe("Answered on 3 calls: 2 later won, 1 still open. Not answered on 1 call: 1 later lost.");
    expect(row.worked.map((item) => item.answerQuote)).toEqual(["you keep the system after", "most of it is follow-up"]);
    expect(row.quotes.every((item) => item.leadName === null)).toBe(true);
    expect(row.reps).toEqual([
      { name: "Milo", heard: 3, answered: 2, won: 1 },
      { name: "Ana", heard: 1, answered: 1, won: 1 },
    ]);
    expect(out.rows[1].workedWords).toBe("Not answered on 1 call: 1 later lost.");
    // Matched by its title when the notes named no item; the starter item is now heard.
    expect(out.rows[1]).toMatchObject({ itemId: PARTNER, heard: 1, heardWords: "Heard on 1 call", quotes: [] });
  });
});

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const join = async (subject: string, role: "member" | "viewer") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${subject}@example.com`, role });
    const who = t.withIdentity(person(subject));
    await who.mutation(api.workspace.acceptInvite, { token: invite.token });
    return who;
  };
  return { t, owner, workspaceId, member: await join("milo", "member"), viewer: await join("vic", "viewer") };
}

describe("the Objection Playbook on the Playbook", () => {
  it("adds the starter set once, labelled not yet heard, and a Viewer cannot", async () => {
    const s = await setup();
    await expect(s.viewer.mutation(api.objectionPlaybook.addStarter, { workspaceId: s.workspaceId })).rejects.toThrow();
    expect(await s.member.mutation(api.objectionPlaybook.addStarter, { workspaceId: s.workspaceId })).toBe(STARTER_OBJECTIONS.length);
    expect(await s.owner.mutation(api.objectionPlaybook.addStarter, { workspaceId: s.workspaceId })).toBe(0);
    const view = await s.viewer.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(view.rows).toHaveLength(STARTER_OBJECTIONS.length);
    expect(view.rows.every((row) => row.heardWords === "Starter set: not yet heard on your calls")).toBe(true);
    expect(view).toMatchObject({ starterMissing: 0, canEdit: false, isOwner: false, calls: 0, enough: false });
    const stored = await s.t.run((ctx) => ctx.db.query("playbookItems").collect());
    expect(stored.every((row) => row.folder === "objections" && row.basis === "hypothesis" && row.source.type === "starter")).toBe(true);
  });

  it("counts the closer's notes unquoted, leaves out a reviewed call's notes, and shows leads and reps only to whom it should", async () => {
    const s = await setup();
    await s.owner.mutation(api.objectionPlaybook.addStarter, { workspaceId: s.workspaceId });
    const partner = (await s.t.run((ctx) => ctx.db.query("playbookItems").collect())).find((row) => row.tag === "trust" && row.title.includes("partner"))!;
    await s.t.run(async (ctx) => {
      const note = (leadName: string, at: number) => ctx.db.insert("callNotes", { workspaceId: s.workspaceId, leadName, outcome: "thinking", fit: [], objections: [{ title: partner.title, itemId: partner._id }], writtenBy: "Milo", createdBy: "milo", createdAt: at });
      await note("Jordan Lee", 1);
      const reviewed = await note("Sam Park", 2);
      const projectId = await ctx.db.insert("researchProjects", { workspaceId: s.workspaceId, title: "Call review", objective: "", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "dana", createdAt: 3, updatedAt: 3 });
      await ctx.db.insert("callReviews", {
        workspaceId: s.workspaceId,
        projectId,
        callNoteId: reviewed,
        leadName: "Sam Park",
        status: "ready",
        view: { outcome: "", nextStep: "", checksPassed: true, fit: [], objections: [{ text: "Partner decides", quote: "my wife has to agree", kind: "Buyer's words", answered: false, answerQuote: "", itemId: partner._id }], commitments: [], coverage: [], updates: [], missing: [] },
        createdBy: "dana",
        createdAt: 3,
      });
      // A review that did not pass its checks counts for nothing.
      await ctx.db.insert("callReviews", { workspaceId: s.workspaceId, projectId, leadName: "Kim", status: "ready", view: { outcome: "", nextStep: "", checksPassed: false, fit: [], objections: [{ text: "Partner decides", quote: "ask my partner", kind: "Buyer's words", answered: false, answerQuote: "", itemId: partner._id }], commitments: [], coverage: [], updates: [], missing: [] }, createdBy: "dana", createdAt: 4 });
    });
    const owner = await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(owner.calls).toBe(2);
    expect(owner.rows[0]).toMatchObject({ itemId: partner._id, heard: 2, quotes: [{ quote: "my wife has to agree", leadName: "Sam Park" }], reps: [{ name: "Milo", heard: 2, answered: 0, won: 0 }] });
    // A Member with no sales role sees the words but not whose they were, and no per-rep figures.
    const member = await s.member.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(member.rows[0].quotes).toEqual([{ quote: "my wife has to agree", at: 3, leadName: null }]);
    expect(member.rows[0].reps).toBeUndefined();
  });

  it("adds an objection heard on a reviewed call to the Objections folder, from that call, with the buyer's words", async () => {
    const s = await setup();
    const reviewId = await s.t.run(async (ctx) => {
      const projectId = await ctx.db.insert("researchProjects", { workspaceId: s.workspaceId, title: "Call review", objective: "", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "dana", createdAt: 1, updatedAt: 1 });
      return ctx.db.insert("callReviews", { workspaceId: s.workspaceId, projectId, leadName: "Jordan Lee", status: "ready", view: { outcome: "", nextStep: "", checksPassed: true, fit: [], objections: [{ text: "We use another agency", quote: "we already have someone", kind: "Buyer's words", answered: false, answerQuote: "" }], commitments: [], coverage: [], updates: [], missing: [] }, createdBy: "dana", createdAt: 1 });
    });
    await expect(s.viewer.mutation(api.objectionPlaybook.addHeard, { workspaceId: s.workspaceId, reviewId, title: "We use another agency", tag: "fit" })).rejects.toThrow();
    const id = await s.member.mutation(api.objectionPlaybook.addHeard, { workspaceId: s.workspaceId, reviewId, title: "We use another agency", tag: "fit" });
    expect(await s.member.mutation(api.objectionPlaybook.addHeard, { workspaceId: s.workspaceId, reviewId, title: "we use another agency", tag: "fit" })).toBe(id);
    const row = await s.t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ folder: "objections", kind: "objection", tag: "fit", quote: "we already have someone", basis: "firstParty", source: { type: "call", ref: reviewId, label: "Call review: Jordan Lee" } });
    const view = await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(view.unmatched).toEqual([]);
    expect(view.rows[0]).toMatchObject({ itemId: id, heard: 1 });
  });
});
