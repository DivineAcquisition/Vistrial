import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_CATALOG, listAgentDefinitions } from "@/lib/agents/catalog";
import { decideCaps, seededOrgAgentSettings } from "@/lib/agents/caps";
import { AGENT_FORBIDDEN_TOOLS, isForbiddenToolName } from "@/lib/agents/forbidden";
import { FORBIDDEN_MODEL_IDS, assertModelAllowed, configuredModelId, DEFAULT_ROUTES } from "@/lib/agents/model-config";
import { resolveModel } from "@/lib/agents/router";
import { AGENT_TOOL_REGISTRY, isToolAllowedForAgent, assertNoGenericWriteTools } from "@/lib/agents/registry";
import { genericWriteToolNames, isAllowlistedExternalWrite, isForbiddenExternalTarget, EXTERNAL_WRITE_ATTRIBUTION } from "@/lib/agents/external";
import { previewExternalWrite, isRawPayloadPreview, previewShowsEveryRecord } from "@/lib/agents/preview";
import { canApproveExternalWrite, observationBlocksExecution, batchWriteCap, canUndo } from "@/lib/agents/approvals";
import { resolveAgentActor, agentCanExceedUser } from "@/lib/agents/identity";
import { yieldIfUserIsWorking, resolveAgentPriority, agentSqlTakesUserLock } from "@/lib/agents/priority";
import { afterFailedRun, failureNextState, nextRetryAt } from "@/lib/agents/retry";
import { estimatedAgentSpendUsd } from "@/lib/agents/spend";
import { triggerKey, isDuplicateTrigger } from "@/lib/agents/triggers";
import { isDueInOrgTimezone } from "@/lib/agents/schedule";
import { shouldEscalateAfterVerification, escalationRate } from "@/lib/agents/escalation";
import { shouldUseBatchApi, pageToolResult, withPromptCache, cacheHitInputFactor, batchDiscountFactor } from "@/lib/agents/anthropic";
import { assetExportBlocked, agentMayEmailOrShareAsset } from "@/lib/agents/assets";
import { mayResearch, researchedFactComplete, RESEARCH_VISUAL_CLASS, PROSPECT_SAID_VISUAL_CLASS } from "@/lib/agents/research";
import { researchCompany, researchPerson } from "@/lib/agents/research-run";
import { assertAgentMayRun } from "@/lib/agents/assert";
import { AGENT_EXTERNAL_BATCH_CAP_DEFAULT, AGENT_INTERNAL_BATCH_CAP_DEFAULT } from "@/lib/agents/constants";
import { canViewReporting } from "@/lib/auth/permissions";
import { containsMessageBody, redactForAgent } from "@/lib/operator/redact";

const agentsDir = path.join(process.cwd(), "src/lib/agents");

function readAgentsSource(): string {
  return readdirSync(agentsDir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(path.join(agentsDir, file), "utf8"))
    .join("\n");
}

describe("agent catalog is a curated set", () => {
  it("ships only the operator and no working new agent", () => {
    expect(listAgentDefinitions().map((row) => row.id)).toEqual(["operator"]);
    expect(AGENT_CATALOG.operator.defaultEnabled).toBe(true);
    expect(AGENT_CATALOG.operator.modes).toEqual(["on_demand"]);
  });

  it("new writing agents seed off and watch first", () => {
    const seeded = seededOrgAgentSettings("org", {
      ...AGENT_CATALOG.operator,
      id: "operator",
      defaultEnabled: false,
      writes: true,
    });
    expect(seeded.enabled).toBe(false);
    expect(seeded.observationMode).toBe(true);
  });
});

describe("one runtime", () => {
  it("has a single runAgentRuntime export and no per-agent loop file", () => {
    const source = readAgentsSource();
    expect(source).toMatch(/export async function runAgentRuntime/);
    const files = readdirSync(agentsDir);
    expect(files.some((file) => file.includes("playbook-loop") || file.includes("operator-loop"))).toBe(false);
    const loop = readFileSync(path.join(process.cwd(), "src/lib/operator/loop.ts"), "utf8");
    expect(loop).toMatch(/runAgentRuntime/);
  });
});

describe("caps and halt", () => {
  it("hard-stops on halt, disable, missing identity, run cap, and spend cap", () => {
    const settings = seededOrgAgentSettings("org", AGENT_CATALOG.operator);
    const halted = decideCaps({ halted: true, settings: { ...settings, enabled: true }, runsToday: 0, spendTodayUsd: 0, hasIdentity: true });
    const disabled = decideCaps({ halted: false, settings: { ...settings, enabled: false }, runsToday: 0, spendTodayUsd: 0, hasIdentity: true });
    const noIdentity = decideCaps({ halted: false, settings: { ...settings, enabled: true }, runsToday: 0, spendTodayUsd: 0, hasIdentity: false });
    const runCap = decideCaps({ halted: false, settings: { ...settings, enabled: true, dailyRunCap: 2 }, runsToday: 2, spendTodayUsd: 0, hasIdentity: true });
    const spendCap = decideCaps({ halted: false, settings: { ...settings, enabled: true, dailySpendCapUsd: 5 }, runsToday: 0, spendTodayUsd: 5, hasIdentity: true });
    expect(halted.ok ? null : halted.reason).toBe("halted");
    expect(disabled.ok ? null : disabled.reason).toBe("disabled");
    expect(noIdentity.ok ? null : noIdentity.reason).toBe("no_identity");
    expect(runCap.ok ? null : runCap.reason).toBe("run_cap");
    expect(spendCap.ok ? null : spendCap.reason).toBe("spend_cap");
    expect(decideCaps({ halted: false, settings: { ...settings, enabled: true }, runsToday: 0, spendTodayUsd: 0, hasIdentity: true }).ok).toBe(true);
  });

  it("scheduled without a service member cannot start", () => {
    const gate = assertAgentMayRun({
      agentId: "operator",
      mode: "on_demand",
      halted: false,
      settings: { ...seededOrgAgentSettings("org", AGENT_CATALOG.operator), enabled: true },
      runsToday: 0,
      spendTodayUsd: 0,
      actor: null,
    });
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.reason).toBe("no_identity");
  });
});

describe("model routing", () => {
  it("does not hardcode a model id in application logic", () => {
    const files = readdirSync(agentsDir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    for (const file of files) {
      if (file === "model-config.ts") continue;
      const text = readFileSync(path.join(agentsDir, file), "utf8");
      expect(text, file).not.toMatch(/claude-opus-5|claude-sonnet-5|claude-haiku-4-5-20251001/);
      expect(text, file).not.toMatch(/claude-fable|fable-5/);
    }
  });

  it("resolves work kinds from configuration and records a version", () => {
    const resolved = resolveModel({ workKind: "agent_planning", mode: "on_demand" });
    expect(resolved.modelId).toBe(configuredModelId("sonnet"));
    expect(resolved.version).toBe(resolved.modelId);
    expect(resolved.useBatch).toBe(false);
    const asyncResolved = resolveModel({ workKind: "playbook", mode: "scheduled" });
    expect(asyncResolved.useBatch).toBe(true);
    expect(asyncResolved.tier).toBe("opus");
  });

  it("forbids the creative-tier model", () => {
    expect(FORBIDDEN_MODEL_IDS).toContain("claude-fable-5");
    expect(() => assertModelAllowed("claude-fable-5")).toThrow(/creative-tier/);
    expect(DEFAULT_ROUTES.every((row) => !row.modelId.toLowerCase().includes("fable"))).toBe(true);
  });

  it("uses the batch API for async work and caches repeated prompts", () => {
    expect(shouldUseBatchApi("scheduled")).toBe(true);
    expect(shouldUseBatchApi("on_demand")).toBe(false);
    expect(withPromptCache("system").cache_control).toEqual({ type: "ephemeral" });
    expect(cacheHitInputFactor()).toBe(0.1);
    expect(batchDiscountFactor()).toBe(0.5);
    expect(pageToolResult([1, 2, 3], 0).hasMore).toBe(false);
  });

  it("logs escalation and exposes a rate", () => {
    expect(
      shouldEscalateAfterVerification({
        declaredTier: "sonnet",
        escalateOnFailure: true,
        verificationPassed: false,
        alreadyEscalated: false,
      }),
    ).toBe(true);
    expect(escalationRate(2, 10)).toBe(0.2);
  });
});

describe("identity", () => {
  const setter = { userId: "u", memberId: "m", role: "setter" as const, displayName: "Sam Setter" };
  const owner = { userId: "o", memberId: "om", role: "owner" as const, displayName: "Pat Owner" };

  it("on-demand runs as the requester; scheduled runs as the service member", () => {
    expect(resolveAgentActor({ mode: "on_demand", requester: setter, serviceMember: owner })?.memberId).toBe("m");
    expect(resolveAgentActor({ mode: "scheduled", requester: setter, serviceMember: owner })?.memberId).toBe("om");
  });

  it("never elevates; a setter cannot read revenue", () => {
    expect(agentCanExceedUser(setter, AGENT_CATALOG.operator)).toBe(false);
    expect(canViewReporting("setter")).toBe(false);
  });
});

describe("external writes", () => {
  it("has no generic write, API, or code-execution tool", () => {
    const names = AGENT_TOOL_REGISTRY.map((tool) => tool.name);
    assertNoGenericWriteTools(names);
    for (const forbidden of [...AGENT_FORBIDDEN_TOOLS, ...genericWriteToolNames()]) {
      expect(names).not.toContain(forbidden);
    }
    expect(isToolAllowedForAgent("operator", "call_endpoint")).toBe(false);
    expect(isForbiddenToolName("dispatch_message")).toBe(true);
  });

  it("requires a named human and a plain-language preview", () => {
    const preview = previewExternalWrite({
      operation: "crm.add_tag",
      system: "crm",
      recordLabel: "Pat Lead",
      before: "No tag",
      after: "Tag warm",
      reversible: true,
    });
    expect(isRawPayloadPreview(preview.after)).toBe(false);
    expect(canApproveExternalWrite({ preview, namedHumanId: null }).ok).toBe(false);
    expect(canApproveExternalWrite({ preview, namedHumanId: "member-1" }).ok).toBe(true);
    expect(isRawPayloadPreview('{"tag":"x"}')).toBe(true);
    expect(EXTERNAL_WRITE_ATTRIBUTION).toBe("Vistrial");
    expect(isAllowlistedExternalWrite("crm.add_tag")).toBe(true);
    expect(isForbiddenExternalTarget("modify_automation")).toBe(true);
  });

  it("caps external batches tighter than internal and shows every record", () => {
    expect(batchWriteCap(true)).toBe(AGENT_EXTERNAL_BATCH_CAP_DEFAULT);
    expect(batchWriteCap(false)).toBe(AGENT_INTERNAL_BATCH_CAP_DEFAULT);
    expect(AGENT_EXTERNAL_BATCH_CAP_DEFAULT).toBeLessThan(AGENT_INTERNAL_BATCH_CAP_DEFAULT);
    const records = [{ id: "a" }, { id: "b" }];
    expect(previewShowsEveryRecord(records, records)).toBe(true);
    expect(previewShowsEveryRecord(records, records.slice(0, 1))).toBe(false);
  });

  it("observation blocks writes and undo is bounded", () => {
    expect(observationBlocksExecution(true, "write_external")).toBe(true);
    expect(canUndo({ reversible: true, approvedAt: new Date(), now: new Date() })).toBe(true);
    expect(canUndo({ reversible: false, approvedAt: new Date() })).toBe(false);
  });
});

describe("reading and research", () => {
  it("never reads CRM message content", () => {
    const redacted = redactForAgent({ generated_body: "hi", outboundBody: "sms" });
    expect(containsMessageBody(redacted)).toBe(false);
    expect(isToolAllowedForAgent("operator", "research_person")).toBe(false);
  });

  it("covers companies only and requires source and date", () => {
    expect(mayResearch({ kind: "company" })).toBe(true);
    expect(mayResearch({ kind: "person" })).toBe(false);
    expect(researchPerson("Alex").ok).toBe(false);
    const missing = researchCompany({ companyName: "Acme", providerConfigured: false });
    expect(missing.ok).toBe(false);
    expect(missing.ok ? null : missing.kind).toBe("permission");
    expect(
      researchedFactComplete({
        companyName: "Acme",
        fact: "Hired a closer",
        source: "example.com",
        foundAt: new Date(),
      }),
    ).toBe(true);
    expect(RESEARCH_VISUAL_CLASS).not.toBe(PROSPECT_SAID_VISUAL_CLASS);
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.research-not-said\s*\{/);
    expect(css).toMatch(/\.prospect-said\s*\{/);
  });
});

describe("assets and controls", () => {
  it("requires basis, sample size, review, and verbatim flags before export", () => {
    expect(assetExportBlocked({ reviewed: true, verbatimFlagged: true, sampleSize: 12, dataBasis: "Last 12 calls" }).ok).toBe(true);
    expect(assetExportBlocked({ reviewed: false, verbatimFlagged: true, sampleSize: 12, dataBasis: "Last 12 calls" }).ok).toBe(false);
    expect(agentMayEmailOrShareAsset()).toBe(false);
  });

  it("a daily spend cap of zero is a hard stop, not a default", () => {
    const settings = {
      ...seededOrgAgentSettings("org", AGENT_CATALOG.operator),
      enabled: true,
      dailySpendCapUsd: 0,
    };
    const stopped = decideCaps({
      halted: false,
      settings,
      runsToday: 0,
      spendTodayUsd: 0,
      hasIdentity: true,
    });
    expect(stopped.ok).toBe(false);
    expect(stopped.ok === false && stopped.reason).toBe("spend_cap");
  });
});

describe("retry, triggers, schedule, priority", () => {
  it("retries with bounded backoff then dead-letters", () => {
    expect(nextRetryAt(0)).toBeInstanceOf(Date);
    expect(nextRetryAt(3)).toBeNull();
    expect(afterFailedRun({ status: "failed", retryCount: 3 }).nextStatus).toBe("dead_lettered");
    expect(afterFailedRun({ status: "failed", retryCount: 0 }).nextStatus).toBe("queued");
    expect(failureNextState({ mode: "on_demand", retryCount: 0 }).nextStatus).toBe("failed");
    expect(failureNextState({ mode: "scheduled", retryCount: 0 }).nextStatus).toBe("queued");
    expect(failureNextState({ mode: "scheduled", retryCount: 3 }).nextStatus).toBe("dead_lettered");
  });

  it("attributes spend from tokens including cache hits", () => {
    const spend = estimatedAgentSpendUsd({
      model: "configured-sonnet",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    });
    expect(spend).toBeGreaterThan(0);
    const noCache = estimatedAgentSpendUsd({
      model: "configured-sonnet",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
    });
    expect(spend).toBeGreaterThan(noCache);
  });

  it("is idempotent per trigger", () => {
    const key = triggerKey({ orgId: "o", agentId: "operator", kind: "transcript_landed", eventId: "e1" });
    expect(isDuplicateTrigger({ triggerKey: key }, key)).toBe(true);
    expect(isDuplicateTrigger(null, key)).toBe(false);
  });

  it("evaluates due time in the org timezone", () => {
    const noonUtc = new Date("2026-08-30T17:00:00.000Z");
    expect(isDueInOrgTimezone({ timezone: "America/Chicago", nowUtc: noonUtc, hour: 12, minute: 0 })).toBe(true);
  });

  it("yields background work when a person is working and never takes a user lock", () => {
    expect(resolveAgentPriority("scheduled")).toBe("background");
    return yieldIfUserIsWorking({
      priority: "background",
      lastUserActivityAt: new Date(),
      sleep: async () => undefined,
    }).then((result) => {
      expect(result.yielded).toBe(true);
      expect(agentSqlTakesUserLock("SELECT * FROM leads WHERE org_id = $1")).toBe(false);
      expect(agentSqlTakesUserLock("SELECT * FROM leads FOR UPDATE")).toBe(true);
    });
  });
});

describe("boundaries", () => {
  it("has no path from any agent to a dispatched message", () => {
    const source = readAgentsSource();
    expect(source).not.toMatch(/dispatchOutboundMessage/);
    expect(source).not.toMatch(/approveFollowUp/);
    expect(source).not.toMatch(/getSupabaseAdmin/);
    const adapter = readFileSync(path.join(agentsDir, "operator-adapter.ts"), "utf8");
    expect(adapter).not.toMatch(/dispatchOutboundMessage/);
    const execute = readFileSync(path.join(agentsDir, "external-execute.ts"), "utf8");
    expect(execute).not.toMatch(/dispatchOutboundMessage/);
    expect(execute).toMatch(/ghlRequest/);
  });

  it("does not act across an org boundary", () => {
    const persist = readFileSync(path.join(agentsDir, "persist.ts"), "utf8");
    expect(persist).toMatch(/eq\("org_id"/);
  });
});
