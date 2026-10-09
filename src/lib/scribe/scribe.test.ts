import { describe, expect, it } from "vitest";

import { bandForScore, readBands } from "@/lib/scribe/bands";
import { planFieldWrites, type ExtractedFact } from "@/lib/scribe/merge";
import { findSpokenOptOut } from "@/lib/scribe/optout";
import { passagesForPrompt, passagesForQuote, resolveSpeakers, splitPassages } from "@/lib/scribe/passages";
import { parseFacts, parseSensitive, readCaseFacts } from "@/lib/scribe/prompt";
import { ProviderUnavailable, anthropicUnavailable, isUnavailableStatus } from "@/lib/scribe/provider";
import { findSensitive } from "@/lib/scribe/safety";

const CALL = `Jordan (Glow Med Spa): Hi Avery, thanks for taking the call.
Avery Test: Sure. I'm interested in lip filler, maybe before my wedding in June.
Avery Test: My budget is around eight hundred dollars.
Jordan (Glow Med Spa): Great. Would Thursday work for a consult?
Avery Test: Thursday works. I need to check with my partner first though.`;

describe("passages", () => {
  const hints = { prospectNames: ["Avery", "Test"], teamNames: ["Glow Med Spa", "Jordan"] };

  it("keeps speaker turns, merges consecutive lines, and resolves who is who", () => {
    const passages = splitPassages(CALL, hints);
    expect(passages.map((p) => p.speaker)).toEqual(["team", "prospect", "team", "prospect"]);
    expect(passages[1].body).toContain("lip filler");
    expect(passages[1].body).toContain("eight hundred dollars");
  });

  it("offsets point back into the original transcript", () => {
    for (const p of splitPassages(CALL, hints)) {
      expect(CALL.slice(p.charStart, p.charEnd).trim()).toBe(p.body);
    }
  });

  it("infers the other side of a two-person call from one known speaker", () => {
    const map = resolveSpeakers(["Speaker 1", "Rep"], {});
    expect(map.get("Rep")).toBe("team");
    expect(map.get("Speaker 1")).toBe("prospect");
  });

  it("leaves speakers unknown rather than guessing", () => {
    const map = resolveSpeakers(["Speaker 1", "Speaker 2"], {});
    expect([...map.values()]).toEqual(["unknown", "unknown"]);
  });

  it("chunks long unlabelled text and strips timestamps", () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const passages = splitPassages(`[00:01] ${long}`);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.every((p) => p.body.length <= 1500 && p.speaker === "unknown")).toBe(true);
    expect(passages[0].body.startsWith("Sentence number 0")).toBe(true);
  });

  it("finds the passage that holds a quote", () => {
    const passages = splitPassages(CALL, hints);
    expect(passagesForQuote(passages, "budget is around eight hundred")[0].seq).toBe(2);
    expect(passagesForQuote(passages, "something never said")).toEqual([]);
  });

  it("labels passages for a prompt and clips the middle of long calls", () => {
    const passages = splitPassages(CALL, hints);
    expect(passagesForPrompt(passages, 60000, 20000).text).toContain('[P2 prospect "Avery Test"]');
    const clipped = passagesForPrompt(passages, 80, 80);
    expect(clipped.truncated).toBe(true);
    expect(clipped.text).toContain("[...middle omitted...]");
  });
});

describe("spoken opt-out", () => {
  const passages = (body: string, speaker: "prospect" | "team" = "prospect") => [
    { seq: 1, speaker, speakerLabel: null, body, charStart: 0, charEnd: body.length },
  ];

  it("catches the lead asking for no more contact", () => {
    expect(findSpokenOptOut(passages("Please stop calling me, I'm not interested."))?.seq).toBe(1);
    expect(findSpokenOptOut(passages("Take me off your list."))).not.toBeNull();
  });

  it("ignores the team's words and negations", () => {
    expect(findSpokenOptOut(passages("Just tell me if you want us to stop calling you.", "team"))).toBeNull();
    expect(findSpokenOptOut(passages("I didn't say stop calling me, I said call later."))).toBeNull();
  });

  it("matches a configured word only as a short reply", () => {
    expect(findSpokenOptOut(passages("STOP."), ["STOP"])?.word).toBe("STOP");
    expect(findSpokenOptOut(passages("We should stop by the clinic next week."), ["STOP"])).toBeNull();
  });
});

describe("safety", () => {
  it("returns categories and passage numbers only", () => {
    const found = findSensitive([
      { seq: 1, speaker: "team", speakerLabel: null, body: "If you have chest pain call a doctor.", charStart: 0, charEnd: 10 },
      { seq: 2, speaker: "prospect", speakerLabel: null, body: "Honestly I don't want to live like this.", charStart: 0, charEnd: 10 },
    ]);
    expect(found).toEqual([{ category: "self_harm", seq: 2 }]);
  });
});

describe("bands", () => {
  const bands = readBands([
    { name: "Cold", min_score: 0, meaning: "Not ready", next_step: "Nurture" },
    { name: "Warm", min_score: 40, meaning: "Interested", next_step: "Book a call" },
    { name: "Hot", min_score: 75, meaning: "Ready", next_step: "Close" },
  ]);
  it("derives the band from the number", () => {
    expect(bandForScore(80, bands)?.name).toBe("Hot");
    expect(bandForScore(40, bands)?.name).toBe("Warm");
    expect(bandForScore(3, bands)?.name).toBe("Cold");
    expect(bandForScore(null, bands)).toBeNull();
  });
});

describe("merge", () => {
  const fact = (key: string, value: string | null, state: ExtractedFact["state"] = "present"): ExtractedFact => ({
    key,
    label: key,
    state,
    value,
    quote: value,
    passageIds: [],
  });

  it("never overwrites a person's edit or a locked field", () => {
    const plan = planFieldWrites(
      [
        { field_key: "budget", value: "500", state: "present", source: "person", locked: false },
        { field_key: "timeline", value: "June", state: "present", source: "scribe", locked: true },
        { field_key: "goal", value: "lips", state: "present", source: "scribe", locked: false },
      ],
      [fact("budget", "800"), fact("timeline", "July"), fact("goal", "lip filler")]
    );
    expect(plan.map((w) => w.kind)).toEqual(["review", "review", "scribe"]);
  });

  it("keeps what an earlier call established when this call is silent", () => {
    const plan = planFieldWrites([{ field_key: "budget", value: "800", state: "present", source: "scribe", locked: false }], [fact("budget", null, "absent")]);
    expect(plan[0].kind).toBe("keep");
  });
});

describe("fact parsing", () => {
  const specs = readCaseFacts([
    { key: "treatment_interest", label: "Treatment", type: "text", required: true },
    { key: "budget", label: "Budget", type: "number" },
    { key: "has_partner_input", label: "Partner involved", type: "yes_no" },
    { key: "event_date", label: "Event date", type: "date" },
  ]);
  const passages = splitPassages(CALL, { prospectNames: ["Avery"], teamNames: ["Jordan"] });
  const ids = new Map(passages.map((p) => [p.seq, `id-${p.seq}`]));

  it("keeps present facts only with a quote found in a passage", () => {
    const facts = parseFacts(
      {
        facts: [
          { key: "treatment_interest", state: "present", value: "lip filler", quote: "I'm interested in lip filler" },
          { key: "budget", state: "present", value: "$800", quote: "My budget is around eight hundred dollars" },
          { key: "has_partner_input", state: "present", value: "yes", quote: "my partner said yes already" },
        ],
      },
      specs,
      passages,
      ids
    );
    expect(facts[0]).toMatchObject({ state: "present", value: "lip filler", passageIds: ["id-2"] });
    expect(facts[1]).toMatchObject({ state: "present", value: 800 });
    expect(facts[2]).toMatchObject({ state: "unclear", value: null });
    expect(facts[3]).toMatchObject({ state: "absent", value: null });
  });

  it("reads a sensitive flag only with a known category", () => {
    expect(parseSensitive({ sensitive: { flag: true, category: "abuse" } })).toBe("abuse");
    expect(parseSensitive({ sensitive: { flag: true, category: "made_up" } })).toBeNull();
    expect(parseSensitive({ sensitive: { flag: false, category: "abuse" } })).toBeNull();
  });
});

describe("provider classification", () => {
  it("treats credits, limits, and outages as waiting, not failure", () => {
    expect([402, 429, 503, 529].every(isUnavailableStatus)).toBe(true);
    expect(isUnavailableStatus(400)).toBe(false);
    expect(anthropicUnavailable(Object.assign(new Error("anthropic_http"), { status: 529 }))).toBeInstanceOf(ProviderUnavailable);
    expect(anthropicUnavailable(new Error("missing_api_key"))).toBeInstanceOf(ProviderUnavailable);
    expect(anthropicUnavailable(Object.assign(new Error("anthropic_http"), { status: 400 }))).toBeNull();
    expect(anthropicUnavailable(new Error("invalid_json"))).toBeNull();
  });
});
