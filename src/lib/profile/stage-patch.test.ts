import { describe, expect, it } from "vitest";

import { buildStagePatch } from "@/lib/profile/stage-patch";

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

function patchOf(stage: Parameters<typeof buildStagePatch>[0], data: FormData) {
  const result = buildStagePatch(stage, data);
  if (!result.ok) throw new Error(`expected a patch, got: ${result.error}`);
  return result.patch;
}

describe("business stage", () => {
  it("stores money in cents and leaves untouched fields null", () => {
    const patch = patchOf(
      "business",
      form([
        ["offer_name", " 12 Week Transformation "],
        ["offer_type", "coaching"],
        ["price_point", "6000"],
        ["stated_close_rate_pct", "10.48"],
        ["sales_cycle_days", "45"],
      ])
    );
    expect(patch.offer_name).toBe("12 Week Transformation");
    expect(patch.price_point_cents).toBe(600000);
    expect(patch.stated_close_rate_pct).toBe(10.48);
    expect(patch.sales_cycle_days).toBe(45);
    expect(patch.touches_to_close).toBeNull();
  });

  it("accepts a fractional close rate rather than forcing it to a round step", () => {
    const patch = patchOf("business", form([["stated_close_rate_pct", "10.48"]]));
    expect(patch.stated_close_rate_pct).toBe(10.48);
  });

  it("refuses a close rate that is not a percentage", () => {
    const result = buildStagePatch("business", form([["stated_close_rate_pct", "140"]]));
    expect(result).toEqual({ ok: false, error: "A close rate is a percentage between 0 and 100." });
  });

  it("refuses a free offer", () => {
    const result = buildStagePatch("business", form([["price_point", "0"]]));
    expect(result.ok).toBe(false);
  });
});

describe("funnel stage", () => {
  it("keeps every ticked channel, not just the first", () => {
    const patch = patchOf(
      "funnel",
      form([
        ["lead_channels", "meta_ads"],
        ["lead_channels", "organic_social"],
        ["lead_channels", "referral"],
      ])
    );
    expect(patch.lead_channels).toEqual(["meta_ads", "organic_social", "referral"]);
  });

  it("drops a value that is not in the vocabulary", () => {
    const patch = patchOf(
      "funnel",
      form([
        ["lead_channels", "meta_ads"],
        ["lead_channels", "carrier_pigeon"],
      ])
    );
    expect(patch.lead_channels).toEqual(["meta_ads"]);
  });

  it("records spend only for channels that were actually ticked", () => {
    const patch = patchOf(
      "funnel",
      form([
        ["lead_channels", "meta_ads"],
        ["spend_meta_ads", "4000"],
        ["spend_google_ads", "9000"],
      ])
    );
    expect(patch.channel_spend_cents).toEqual({ meta_ads: 400000 });
  });

  it("refuses an application row with a factor but no answer key", () => {
    const result = buildStagePatch(
      "funnel",
      form([["application_fields", JSON.stringify([{ answer_key: "", factor: "timeline" }])]])
    );
    expect(result.ok).toBe(false);
  });
});

describe("qualification stage", () => {
  it("keeps every ticked signal", () => {
    const patch = patchOf(
      "qualification",
      form([
        ["qualification_signals", "has_budget"],
        ["qualification_signals", "urgent_timeline"],
      ])
    );
    expect(patch.qualification_signals).toEqual(["has_budget", "urgent_timeline"]);
  });

  it("clamps a band score into range and rounds it", () => {
    const patch = patchOf(
      "qualification",
      form([
        [
          "price_bands",
          JSON.stringify([
            { answer: "25k+", score: "140" },
            { answer: "under 5k", score: "-3" },
            { answer: "10k", score: "62.6" },
          ]),
        ],
      ])
    );
    expect(patch.price_bands).toEqual([
      { answer: "25k+", score: 100 },
      { answer: "under 5k", score: 0 },
      { answer: "10k", score: 63 },
    ]);
  });

  it("refuses a band with a score but no answer", () => {
    const result = buildStagePatch(
      "qualification",
      form([["timeline_bands", JSON.stringify([{ answer: "", score: "80" }])]])
    );
    expect(result).toEqual({
      ok: false,
      error: "One timeline band has a score but no answer. Fill it in or remove the row.",
    });
  });
});

describe("process stage", () => {
  it("keeps the three existing-follow-up answers so nothing doubles up", () => {
    const patch = patchOf(
      "process",
      form([
        ["speed_to_lead_intent_minutes", "15"],
        ["after_no_show", "crm_sequence"],
        ["after_call", "manual_only"],
        ["after_silence", "nothing"],
        ["setter_establishes", "budget_confirmed"],
        ["setter_establishes", "timeline_confirmed"],
      ])
    );
    expect(patch.speed_to_lead_intent_minutes).toBe(15);
    expect(patch.after_no_show).toBe("crm_sequence");
    expect(patch.setter_establishes).toEqual(["budget_confirmed", "timeline_confirmed"]);
  });

  it("refuses a response window longer than a day", () => {
    const result = buildStagePatch("process", form([["speed_to_lead_intent_minutes", "2000"]]));
    expect(result.ok).toBe(false);
  });
});

describe("objections stage", () => {
  it("keeps a row whose type dropdown was never touched", () => {
    const patch = patchOf(
      "objections",
      form([
        [
          "top_objections",
          JSON.stringify([
            { type: "price", phrasing: "It's a lot of money right now", response: "What would make it worth it?" },
            { type: "timing", phrasing: "After the holidays", response: null },
          ]),
        ],
      ])
    );
    expect(patch.top_objections).toHaveLength(2);
  });

  it("refuses rather than silently dropping a phrasing with no type", () => {
    const result = buildStagePatch(
      "objections",
      form([["top_objections", JSON.stringify([{ type: "", phrasing: "It costs too much" }])]])
    );
    expect(result).toEqual({
      ok: false,
      error: '"It costs too much" has no objection type against it. Pick one or remove the row.',
    });
  });

  it("refuses two objections of the same type, which would collapse to one", () => {
    const result = buildStagePatch(
      "objections",
      form([
        [
          "top_objections",
          JSON.stringify([
            { type: "price", phrasing: "Too expensive" },
            { type: "price", phrasing: "No budget this quarter" },
          ]),
        ],
      ])
    );
    expect(result.ok).toBe(false);
  });
});

describe("voice and goals stages", () => {
  it("splits the never-say list on lines and commas", () => {
    const patch = patchOf(
      "voice",
      form([
        ["voice_formality", "casual"],
        ["channel_preference", "sms"],
        ["never_say", "unlock\ngame-changer, synergy\n\n"],
      ])
    );
    expect(patch.never_say).toEqual(["unlock", "game-changer", "synergy"]);
  });

  it("treats an unticked consent box as still contributing", () => {
    const patch = patchOf("goals", form([["goal_metric", "clients_per_month"], ["goal_value", "8"]]));
    expect(patch.aggregate_opt_out).toBe(false);
    expect(patch.goal_value).toBe(8);
  });

  it("honours the opt-out when it is ticked", () => {
    const patch = patchOf("goals", form([["aggregate_opt_out", "on"]]));
    expect(patch.aggregate_opt_out).toBe(true);
  });

  it("refuses a target of zero", () => {
    const result = buildStagePatch("goals", form([["goal_value", "0"]]));
    expect(result.ok).toBe(false);
  });
});

describe("connect stage", () => {
  it("has no fields of its own", () => {
    expect(patchOf("connect", form([]))).toEqual({});
  });
});
