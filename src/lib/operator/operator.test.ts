import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { canAssignLeadTo, canViewReporting } from "@/lib/auth/permissions";
import {
  OPERATOR_FORBIDDEN_TOOLS,
  OPERATOR_PROPOSE_TOOLS,
  OPERATOR_READ_TOOLS,
  OPERATOR_TOOL_NAMES,
  isOperatorToolName,
  isProposeToolName,
  operatorAnthropicTools,
} from "@/lib/operator/catalog";
import {
  OPERATOR_BATCH_CAP_DEFAULT,
  OPERATOR_BATCH_CAP_MAX,
  OPERATOR_HONESTY,
  OPERATOR_RESULT_PAGE_SIZE,
  OPERATOR_STEP_LIMIT,
} from "@/lib/operator/constants";
import { batchCapDenied, classifyToolError, permissionDenied } from "@/lib/operator/errors";
import { OPERATOR_SYSTEM_PROMPT } from "@/lib/operator/prompt";
import { containsMessageBody, jsonForModel, redactForAgent } from "@/lib/operator/redact";
import { toolLabel } from "@/lib/operator/labels";

describe("operator tool catalog", () => {
  it("only exposes read wrappers and propose_* writes", () => {
    expect(OPERATOR_TOOL_NAMES).toEqual([...OPERATOR_READ_TOOLS, ...OPERATOR_PROPOSE_TOOLS]);
    for (const name of OPERATOR_PROPOSE_TOOLS) {
      expect(name.startsWith("propose_")).toBe(true);
      expect(isProposeToolName(name)).toBe(true);
    }
    expect(isOperatorToolName("approve_follow_up")).toBe(false);
    expect(isOperatorToolName("execute_write")).toBe(false);
  });

  it("does not catalog send, approve, delete, activate, or settings tools", () => {
    const names = operatorAnthropicTools().map((tool) => tool.name);
    for (const forbidden of OPERATOR_FORBIDDEN_TOOLS) {
      expect(names).not.toContain(forbidden);
    }
    expect(names.some((name) => name.includes("send"))).toBe(false);
    expect(names.some((name) => name.includes("approve"))).toBe(false);
    expect(names.some((name) => name.includes("delete"))).toBe(false);
  });
});

describe("operator permissions", () => {
  it("a setter cannot read reporting/revenue", () => {
    expect(canViewReporting("setter")).toBe(false);
    expect(canViewReporting("owner")).toBe(true);
    const denied = permissionDenied("You do not have permission to read reporting figures.");
    expect(denied.kind).toBe("permission");
    expect(denied.error).not.toMatch(/nothing found/i);
  });

  it("a setter cannot assign to another member", () => {
    expect(
      canAssignLeadTo({
        role: "setter",
        actorMemberId: "setter-1",
        targetMemberId: "dana",
      })
    ).toBe(false);
    expect(
      canAssignLeadTo({
        role: "setter",
        actorMemberId: "setter-1",
        targetMemberId: "setter-1",
      })
    ).toBe(true);
  });
});

describe("operator safety copy", () => {
  it("classifies permission failures separately from empty results", () => {
    expect(classifyToolError("reporting is owner/admin only").kind).toBe("permission");
    expect(classifyToolError("You do not have permission to do that.").kind).toBe("permission");
    expect(classifyToolError("That lead is not in this workspace.").kind).toBe("failed");
  });

  it("refuses a batch above the cap without truncating", () => {
    const denied = batchCapDenied(40, OPERATOR_BATCH_CAP_DEFAULT);
    expect(denied.kind).toBe("batch_cap");
    expect(denied.error).toContain("40");
    expect(denied.error).toContain(String(OPERATOR_BATCH_CAP_DEFAULT));
    expect(denied.error).toMatch(/truncated/i);
    expect(OPERATOR_BATCH_CAP_MAX).toBe(40);
  });

  it("tells the model not to invent an answer when a tool is empty", () => {
    expect(OPERATOR_SYSTEM_PROMPT).toContain(OPERATOR_HONESTY);
    expect(OPERATOR_SYSTEM_PROMPT).toMatch(/nothing was found/i);
    expect(OPERATOR_SYSTEM_PROMPT).toMatch(/two members share a first name/i);
    expect(OPERATOR_SYSTEM_PROMPT).toMatch(/off-scope/i);
  });
});

describe("operator redaction", () => {
  it("never returns message bodies or transcripts to the model", () => {
    const redacted = redactForAgent({
      generated_body: "Hey Maya, following up",
      rawTranscript: "Closer: hi\nProspect: hi",
      outboundBody: "sms text",
      leadId: "abc",
    });
    expect(redacted).toEqual({
      generated_body: "[redacted]",
      rawTranscript: "[redacted]",
      outboundBody: "[redacted]",
      leadId: "abc",
    });
    expect(containsMessageBody({ generated_body: "hi" })).toBe(true);
    expect(containsMessageBody(redacted)).toBe(false);
    expect(jsonForModel({ sent_body: "secret" })).toContain("[redacted]");
  });

  it("keeps names so two people named Marcus can be distinguished", () => {
    const redacted = redactForAgent({
      members: [
        { id: "1", displayName: "Marcus Hale" },
        { id: "2", displayName: "Marcus Chen" },
      ],
      verbatim: "I cannot afford this",
    }) as { members: Array<{ displayName: string }>; verbatim: string };
    expect(redacted.members[0].displayName).toBe("Marcus Hale");
    expect(redacted.members[1].displayName).toBe("Marcus Chen");
    expect(redacted.verbatim).toBe("[redacted]");
  });
});

describe("operator limits", () => {
  it("pages list results instead of dumping them", () => {
    expect(OPERATOR_RESULT_PAGE_SIZE).toBe(20);
    expect(OPERATOR_STEP_LIMIT).toBe(12);
  });
});

describe("operator execute path", () => {
  it("does not import a service-role client and has no execute_write tool", () => {
    const dir = path.join(process.cwd(), "src/lib/operator");
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const text = readFileSync(path.join(dir, file), "utf8");
      expect(text).not.toMatch(/getSupabaseAdmin/);
      expect(text).not.toMatch(/dispatchOutboundMessage/);
      expect(text).not.toMatch(/approveFollowUp/);
    }
    const apiRoot = path.join(process.cwd(), "src/app/api/operator");
    for (const file of ["runs/route.ts", "runs/[id]/continue/route.ts"]) {
      const text = readFileSync(path.join(apiRoot, file), "utf8");
      expect(text).not.toMatch(/getSupabaseAdmin/);
    }
    const actions = readFileSync(path.join(process.cwd(), "src/app/app/operator/actions.ts"), "utf8");
    expect(actions).not.toMatch(/getSupabaseAdmin/);
    expect(isOperatorToolName("confirm_write")).toBe(false);
  });

  it("propose tools never call the write executors", () => {
    const propose = readFileSync(path.join(process.cwd(), "src/lib/operator/propose.ts"), "utf8");
    expect(propose).not.toMatch(/from \"@\/lib\/operator\/execute\"/);
    expect(propose).not.toMatch(/assignQueueLead|logQueueOutcome|overrideLeadScore|regenerateFollowUp/);
    expect(propose).toMatch(/insertConfirmation/);
  });

  it("streams a plain-language label instead of the function name", () => {
    const adapter = readFileSync(path.join(process.cwd(), "src/lib/agents/operator-adapter.ts"), "utf8");
    expect(adapter).toMatch(/toolLabel/);
    expect(adapter).toMatch(/label: store\.toolLabel\(tool\.name\)|toolLabel,/);
    const runtime = readFileSync(path.join(process.cwd(), "src/lib/agents/runtime.ts"), "utf8");
    expect(runtime).toMatch(/label: store\.toolLabel\(tool\.name\)/);
    expect(runtime).not.toMatch(/label: tool\.name/);
    expect(toolLabel("find_leads")).toBe("Finding leads");
  });

  it("confirmation records are the full list, never a sliced preview", () => {
    const preview = readFileSync(
      path.join(process.cwd(), "src/components/operator/change-preview.tsx"),
      "utf8"
    );
    expect(preview).toMatch(/records\.map/);
    expect(preview).not.toMatch(/records\.slice/);
    const propose = readFileSync(path.join(process.cwd(), "src/lib/operator/propose.ts"), "utf8");
    expect(propose).not.toMatch(/records\.slice/);
  });
});
