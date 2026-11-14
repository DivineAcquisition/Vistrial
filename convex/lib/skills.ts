import { testEcho } from "../skills/testEcho";
import { testResearch } from "../skills/testResearch";
import { testSources } from "../skills/testSources";
import { marketIntelligence } from "../skills/marketIntelligence";
import { offerIntelligence } from "../skills/offerIntelligence";
import { growthDiagnostics } from "../skills/growthDiagnostics";
import { creativeProduction } from "../skills/creativeProduction";
import { landingTeardown } from "../skills/landingTeardown";
import { landingPageBuild } from "../skills/landingPageBuild";
import { industryTrends } from "../skills/industryTrends";
import { taskProposer } from "../skills/taskProposer";
import { pipelineForensics } from "../skills/pipelineForensics";
import { followUpEngine } from "../skills/followUpEngine";
import { playbookStudy } from "../skills/playbookStudy";
import { dealBriefing } from "../skills/dealBriefing";
import type { SkillModule } from "../skills/types";
import { devSkillsEnabled, type ToolSlug } from "./registry";

/** Every runnable skill. A skill in the catalog but not here is "coming soon" and cannot start. */
const SKILLS: readonly SkillModule[] = [testEcho, testResearch, testSources, marketIntelligence, offerIntelligence, growthDiagnostics, creativeProduction, landingTeardown, landingPageBuild, taskProposer, industryTrends, pipelineForensics, playbookStudy, dealBriefing, followUpEngine];

/** The skill module for a slug, or null when it is not built, or is dev-only and dev skills are off. */
export function skillFor(slug: string, allowDev = devSkillsEnabled()): SkillModule | null {
  const skill = SKILLS.find((row) => row.slug === slug);
  if (!skill || (skill.devOnly && !allowDev)) return null;
  return skill;
}

export function declaredTools(skillSlug: string, allowDev = devSkillsEnabled()): ToolSlug[] {
  return [...(skillFor(skillSlug, allowDev)?.tools ?? [])];
}

export function assertDeclared(skillSlug: string, toolSlug: string, allowDev = devSkillsEnabled()) {
  if (!declaredTools(skillSlug, allowDev).includes(toolSlug as ToolSlug)) {
    throw new Error("That tool is not declared for this skill.");
  }
}
