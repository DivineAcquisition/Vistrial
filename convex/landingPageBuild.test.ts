/**
 * @vitest-environment edge-runtime
 *
 * Landing Page Build: a business with no website gets one landing page, written to the owner's framework from
 * what is on record, with the framework's rules checked in code. The model is scripted: no real model is called.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { writeFact } from "./lib/facts";
import type { ScriptedModel } from "./lib/toolRouter";
import { startRunFor } from "./runs";
import { dropUnprovenResults, runChecks } from "./skills/landingPageBuild/checks";
import { readLayout, type BuildContext, type PageLayout } from "./skills/landingPageBuild/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Globals = { __vistrialScriptedModel?: ScriptedModel };

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

const CONTEXT: BuildContext = {
  businessName: "Steady Practice Coaching",
  selling: { from: "idea", title: "Full Calendar in 60 Days", text: "A 60-day program for therapists in private practice." },
  items: [
    { id: "profile.offer", kind: "profile", text: "What the business sells: Practice growth coaching for therapists, $1,800 for 60 days" },
    { id: "profile.audience", kind: "profile", text: "Who it serves: Therapists in private practice with fewer than 15 clients a week" },
    { id: "fact.proof", kind: "fact", text: "Proof on record: Dr. Lena Ortiz went from 6 to 19 clients a week", proof: true },
    { id: "research.1", kind: "research", text: "Research finding: Most competitors sell monthly retainers with no fixed outcome." },
    { id: "idea", kind: "idea", text: "The offer idea to win customers: Full Calendar in 60 Days." },
  ],
  gaps: [],
};

const GOOD: PageLayout = {
  goal: "Book a practice review call",
  audience: "Therapists in private practice with fewer than 15 clients a week",
  nav: { cta: "Book a review call" },
  hero: { qualifier: "For therapists seeing fewer than 15 clients a week", headline: "A full calendar in 60 days, without becoming a marketer", subline: "A 60-day program built around your practice.", cta: "Book a review call", scarcity: "", from: ["profile.audience", "idea"] },
  results: [{ metric: "6 to 19", context: "clients a week", quote: "My calendar finally fills itself.", name: "Dr. Lena Ortiz", role: "Therapist", from: ["fact.proof"] }],
  problem: [
    { moment: "A referral emails and you reply two days later", cost: "a client lost", from: ["profile.audience"] },
    { moment: "Your directory listing reads like everyone else's", cost: "no calls this month", from: ["research.1"] },
    { moment: "You pay for a retainer with no fixed outcome", cost: "money with no end date", from: ["research.1"] },
  ],
  solution: [{ outcome: "Every enquiry gets a reply the same day", from: [] }, { outcome: "Your listing says who you help and how", from: [] }, { outcome: "A fixed 60-day program with one clear outcome", from: [] }],
  offer: { deliverables: ["A rewritten directory listing", "A same-day reply system", "Weekly coaching calls"], effortLine: "You bring your practice. We build the rest.", price: "$1,800", delivery: "60 days", from: ["profile.offer"] },
  compare: [{ without: "Waiting for referrals", with: "A steady stream of enquiries" }, { without: "Guessing what to post", with: "One clear message" }, { without: "Retainers that never end", with: "A fixed 60 days" }],
  process: [{ step: "A review call", yourTime: "30 minutes" }, { step: "We rewrite your listing", yourTime: "15 minutes to approve" }, { step: "Weekly coaching", yourTime: "45 minutes a week" }],
  roles: { yours: ["Join the calls", "Approve the listing"], ours: ["Rewrite the listing", "Build the reply system", "Run the coaching", "Track enquiries"] },
  faq: [
    { question: "What does it cost?", answer: "$1,800 for the 60 days.", topic: "price", from: ["profile.offer"] },
    { question: "Is there a guarantee?", answer: "No guarantee is stated yet; ask on the call.", topic: "guarantee", from: ["profile.offer"] },
    { question: "Is this for me?", answer: "If you see fewer than 15 clients a week, yes.", topic: "whoFor", from: ["profile.audience"] },
    { question: "How long does it take?", answer: "60 days.", topic: "howLong", from: ["profile.offer"] },
    { question: "What if it doesn't work for me?", answer: "We review your numbers on the call before you start.", topic: "whatIf", from: [] },
  ],
  finalCta: { line: "A full calendar in 60 days.", cta: "Book a review call", timing: "" },
  limits: [],
};

describe("the framework's rules for a page Vistrial builds", () => {
  it("passes a page that follows the framework and cites what it rests on", () => {
    expect(runChecks(GOOD, CONTEXT)).toMatchObject({ passed: true });
  });

  it("refuses unmatched pains and fixes, a missing FAQ topic, a weak button, an invented number and an empty section", () => {
    const failed = (layout: PageLayout) => runChecks(layout, CONTEXT).results.filter((row) => !row.passed).map((row) => row.key);
    expect(failed({ ...GOOD, solution: GOOD.solution.slice(0, 2) })).toEqual(["pains_match"]);
    expect(failed({ ...GOOD, faq: GOOD.faq.filter((row) => row.topic !== "guarantee") })).toEqual(["faq_topics"]);
    expect(failed({ ...GOOD, hero: { ...GOOD.hero, cta: "Submit" } })).toEqual(["cta_verbs"]);
    expect(failed({ ...GOOD, problem: [{ ...GOOD.problem[0], cost: "~$4,000 lost a month" }, ...GOOD.problem.slice(1)] })).toEqual(["no_invented_numbers"]);
    expect(failed({ ...GOOD, offer: { ...GOOD.offer, deliverables: [] } })).toEqual(["required_sections"]);
    expect(failed({ ...GOOD, hero: { ...GOOD.hero, from: ["fact.made-up"] } })).toEqual(["traceable"]);
    expect(failed({ ...GOOD, hero: { ...GOOD.hero, headline: "The proven system that converts better" } })).toEqual(["no_causal_claims"]);
    expect(failed({ ...GOOD, roles: { yours: ["a", "b", "c", "d", "e"], ours: ["x"] } })).toEqual(["effort_shape"]);
  });

  it("leaves Results out when nothing on record proves it", () => {
    const noProof = { ...CONTEXT, items: CONTEXT.items.filter((item) => !item.proof) };
    expect(dropUnprovenResults(GOOD, noProof)).toMatchObject({ dropped: 1, layout: { results: [] } });
    expect(dropUnprovenResults(GOOD, CONTEXT).layout.results).toHaveLength(1);
    expect(readLayout("nope")).toBeNull();
    expect(readLayout({ faq: [{ question: "q", answer: "a", topic: "weird", from: "x" }] })?.faq[0]).toMatchObject({ topic: "other", from: [] });
  });
});

describe("a landing page run", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedModel;
  });

  async function seed(t: Tester) {
    const owner = t.withIdentity(person("lpb-owner"));
    const workspaceId = (await owner.mutation(api.workspace.create, { name: "Steady Practice Coaching" })) as Id<"workspaces">;
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "on" });
    await t.run(async (ctx) => {
      await ctx.db.insert("modelRoutes", { workKind: "write", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
      await ctx.db.insert("profileVersions", { workspaceId, version: 1, offer: "Practice growth coaching for therapists, $1,800 for 60 days", priceNotes: "", audience: "Therapists in private practice with fewer than 15 clients a week", geography: "United States", channels: "", brandVoice: "", competitors: [], confirmedBy: "lpb-owner", confirmedAt: 1, status: "confirmed" });
    });
    return { owner, workspaceId };
  }

  it("gathers what is on record, writes the page, keeps Results only on real proof, and saves it ready for approval", async () => {
    const t = makeTester();
    const { owner, workspaceId } = await seed(t);
    const inputs: string[] = [];
    (globalThis as Globals).__vistrialScriptedModel = (params) => {
      const input = JSON.stringify(params.messages);
      inputs.push(input);
      // The model cites the ids it was given; with no proof on record its proof card cites nothing real.
      const layout = { ...GOOD, hero: { ...GOOD.hero, from: ["profile.audience"] }, results: [{ ...GOOD.results[0], from: ["fact.none"] }], faq: GOOD.faq.map((row) => ({ ...row, from: row.from.length ? ["profile.offer"] : [] })), problem: GOOD.problem.map((row) => ({ ...row, from: ["profile.audience"] })), offer: { ...GOOD.offer, from: ["profile.offer"] } };
      return { text: JSON.stringify(layout) };
    };
    const runId = await t.run((ctx) => startRunFor(ctx, { workspaceId, userId: "lpb-owner", role: "owner", checkCredit: false, agentSlug: "growth-architect", skillSlug: "landing-page-build", inputRef: "manual" }));
    for (let i = 0; i < 40; i += 1) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.status).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED");
    expect(inputs[0]).toContain("[profile.offer]");
    const asset = await t.run((ctx) => ctx.db.query("assets").withIndex("by_workspace_kind", (q) => q.eq("workspaceId", workspaceId).eq("kind", "landingPage")).first());
    expect(asset).toMatchObject({ status: "draft", title: "Landing page: Practice growth coaching for therapists, $1,800 for 60 days" });
    const version = await t.run((ctx) => ctx.db.query("assetVersions").filter((q) => q.eq(q.field("assetId"), asset!._id)).first());
    expect(version?.body).toContain("## Hero");
    expect(version?.body).not.toContain("## Results");
    expect(version?.body).toContain("No testimonials or results are on record, so the Results section is left out.");
    expect(version?.body).toContain("_Built from: What the business sells");
  });

  it("keeps a real proof card, and a page that breaks the framework after its revision waits for review", async () => {
    const t = makeTester();
    const { workspaceId } = await seed(t);
    await t.run((ctx) => writeFact(ctx, { workspaceId, factKey: "proof", value: "Dr. Lena Ortiz went from 6 to 19 clients a week", sourceType: "owner", recordedBy: "lpb-owner", verifiedBy: "lpb-owner" }));
    let calls = 0;
    (globalThis as Globals).__vistrialScriptedModel = (params) => {
      calls += 1;
      const input = JSON.stringify(params.messages);
      const proofId = input.match(/\[(fact\.[^\]]+)\] \(proof\)/)?.[1] ?? "none";
      // Both drafts have fewer fixes than pains.
      const layout = { ...GOOD, solution: GOOD.solution.slice(0, 2), results: [{ ...GOOD.results[0], from: [proofId] }], hero: { ...GOOD.hero, from: ["profile.audience"] }, faq: GOOD.faq.map((row) => ({ ...row, from: row.from.length ? ["profile.offer"] : [] })), problem: GOOD.problem.map((row) => ({ ...row, from: ["profile.audience"] })), offer: { ...GOOD.offer, from: ["profile.offer"] } };
      return { text: JSON.stringify(layout) };
    };
    await t.run((ctx) => startRunFor(ctx, { workspaceId, userId: "lpb-owner", role: "owner", checkCredit: false, agentSlug: "growth-architect", skillSlug: "landing-page-build", inputRef: "manual" }));
    for (let i = 0; i < 40; i += 1) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
    expect(calls).toBe(2);
    const asset = await t.run((ctx) => ctx.db.query("assets").withIndex("by_workspace_kind", (q) => q.eq("workspaceId", workspaceId).eq("kind", "landingPage")).first());
    expect(asset?.status).toBe("needsReview");
    const version = await t.run((ctx) => ctx.db.query("assetVersions").filter((q) => q.eq(q.field("assetId"), asset!._id)).first());
    expect(version?.body).toContain("## Results");
    expect(version?.body).toContain("Each pain has its own fix, one for one");
  });
});
