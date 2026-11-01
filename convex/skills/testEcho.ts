import { INJECTION_FIXTURE, TEST_AGENT, TEST_SKILL, wrapUntrusted } from "../lib/registry";
import type { SkillModule, SkillStep } from "./types";

/**
 * The dev-only test skill: read the confirmed profile, make one model call with the injection fixture
 * as untrusted input, save a draft asset. It proves the runtime end to end without real work.
 */
const PLAN: SkillStep[] = [
  { kind: "tool", toolSlug: "profile.read" },
  { kind: "model", workKind: "write", input: wrapUntrusted(INJECTION_FIXTURE) },
  { kind: "tool", toolSlug: "asset.create" },
];

export const testEcho: SkillModule = {
  slug: TEST_SKILL,
  agentSlug: TEST_AGENT,
  name: "Test echo",
  devOnly: true,
  tools: ["profile.read", "test.echo", "asset.create"],
  output: { assetKind: "researchReport", title: "Test echo" },
  nextStep: ({ steps }) => PLAN[steps.length] ?? null,
};
