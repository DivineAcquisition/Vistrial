/**
 * The shared CRM model's pure rules, and the line every skill keeps: it reads and acts only through
 * `lib/crm/read.ts` and `lib/crm/act.ts`, never through one CRM's own code. docs/rebuild/dealmaker.md, section 3.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ACTION_KINDS, isAllowedWrite, reverseOf, writeRequest } from "../crmActions";
import { CRM_ADAPTERS, adapterFor, canDo } from "./adapter";
import { doItYourself } from "./act";
import { appointmentStatusOf, isCrmProvider } from "./types";

describe("CRM adapters", () => {
  it("has HighLevel behind the adapter, wrapping the merged rules unchanged", () => {
    const hl = adapterFor("highlevel")!;
    expect(hl.label).toBe("HighLevel");
    expect(hl.capabilities).toEqual({ appointments: true, stageHistory: "diffed", actions: ACTION_KINDS });
    expect(hl.writeRequest).toBe(writeRequest);
    expect(hl.isAllowedWrite).toBe(isAllowedWrite);
    expect(hl.reverseOf).toBe(reverseOf);
    for (const kind of ACTION_KINDS) expect(canDo("highlevel", kind)).toBe(true);
  });

  it("knows HubSpot and Salesforce by name but has no adapter for them yet, and nothing else", () => {
    expect(isCrmProvider("hubspot")).toBe(true);
    expect(isCrmProvider("salesforce")).toBe(true);
    expect(isCrmProvider("pipedrive")).toBe(false);
    for (const provider of ["hubspot", "salesforce", "pipedrive", "", null, undefined, "toString", "__proto__"]) {
      expect(adapterFor(provider)).toBeNull();
      expect(canDo(provider, "move_stage")).toBe(false);
    }
    expect(Object.keys(CRM_ADAPTERS)).toEqual(["highlevel"]);
  });
});

describe("appointment statuses", () => {
  it("reads each CRM's words as one of ours, and anything else as unknown", () => {
    expect(appointmentStatusOf("booked")).toBe("booked");
    expect(appointmentStatusOf("new")).toBe("booked");
    expect(appointmentStatusOf("confirmed")).toBe("confirmed");
    expect(appointmentStatusOf("showed")).toBe("showed");
    expect(appointmentStatusOf("noshow")).toBe("noShow");
    expect(appointmentStatusOf("no_show")).toBe("noShow");
    expect(appointmentStatusOf("No Show")).toBe("noShow");
    expect(appointmentStatusOf("cancelled")).toBe("cancelled");
    expect(appointmentStatusOf("canceled")).toBe("cancelled");
    expect(appointmentStatusOf("invalid")).toBe("cancelled");
    expect(appointmentStatusOf(null)).toBe("unknown");
    expect(appointmentStatusOf("pending review")).toBe("unknown");
  });
});

describe("doing it yourself", () => {
  it("says each step in a sentence, naming the CRM when it is known", () => {
    expect(doItYourself({ kind: "move_stage", dealId: "d1", stageId: "s2" }, { crm: "HighLevel", stage: "Proposal sent" })).toBe('Move the deal to "Proposal sent" in HighLevel.');
    expect(doItYourself({ kind: "set_status", dealId: "d1", status: "lost" })).toBe("Mark the deal lost in your CRM.");
    expect(doItYourself({ kind: "add_tag", contactId: "c1", tag: "stalled" }, { lead: "Jordan" })).toBe('Add the tag "stalled" to Jordan in your CRM.');
    expect(doItYourself({ kind: "create_task", contactId: "c1", title: "Call back", dueAt: Date.UTC(2026, 10, 20) })).toBe('Create the task "Call back" for the lead in your CRM, due 2026-11-20.');
    expect(doItYourself({ kind: "send_sms", contactId: "c1", body: "Hi" })).toBe("Copy the text and send it to the lead yourself.");
    expect(doItYourself({ kind: "send_email", contactId: "c1", title: "Hello", body: "Hi" })).toBe("Copy the email and send it to the lead yourself.");
  });
});

describe("skills reach a CRM only through the shared layer", () => {
  const skillsDir = path.resolve(__dirname, "../../skills");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? files(full) : full.endsWith(".ts") ? [full] : [];
    });
  // One CRM's own code. A skill imports `lib/crm/read`, `lib/crm/act` or `lib/crm/types` instead.
  const FORBIDDEN = [/["'][./]*\/highLevel["']/, /["'][./]*\/lib\/highLevel["']/, /["'][./]*\/crmActions["']/, /["'][./]*\/lib\/crmActions["']/, /["'][./]*\/lib\/crm\/(adapter|highlevel)["']/];

  it("no skill imports HighLevel, the action rules or an adapter", () => {
    const offenders = files(skillsDir).filter((file) => {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/from\s+(["'][^"']+["'])/g)].map((match) => match[1]);
      return imports.some((spec) => FORBIDDEN.some((pattern) => pattern.test(spec)));
    });
    expect(offenders.map((file) => path.relative(skillsDir, file))).toEqual([]);
  });
});
