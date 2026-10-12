import type { OrgRole } from "@/types/database";

export const FIRST_RUN_STORAGE_KEY = "vistrial:first-run";

export type FirstRunCopy = {
  title: string;
  body: string;
};

/**
 * One screen of explanation, written for the job the person actually has.
 * Nothing here names a column, a job, or an internal state.
 */
export const FIRST_RUN: Record<OrgRole, FirstRunCopy> = {
  setter: {
    title: "Who to call next",
    body: "Start at the top. Open the CRM, talk, then come back and say what happened. People who have waited too long stay at the top until someone contacts them.",
  },
  closer: {
    title: "Who you are about to talk to",
    body: "Open the person before you dial. You will see who they are, what they already objected to, and what was agreed last time.",
  },
  admin: {
    title: "This client's workspace",
    body: "Forsight is ads and the pipeline. The portal is whether leads became clients. The team works the list under More.",
  },
  operator: {
    title: "Your leads",
    body: "Start at the top of the list. Work the people assigned to you and the ones nobody has picked up yet, then say what happened.",
  },
  member: {
    title: "Your workspace",
    body: "This is where you can see what Vistrial has done for the business: leads, follow-up, and results.",
  },
  owner: {
    title: "Your workspace",
    body: "Forsight is ads, creatives, and the pipeline. The portal is how many leads became clients, whether the team is using this, and where deals are dying.",
  },
  // Stellar roles never reach the operator app's first-run screen — they
  // land on /stellar instead — but the type below must stay exhaustive.
  client_viewer: {
    title: "Your portal",
    body: "This is where you can see your agreement, payment, build progress, and results.",
  },
  da_operator: {
    title: "Vistrial team",
    body: "Every active placement, in one list.",
  },
};

export function firstRunStorageKey(role: OrgRole): string {
  return `${FIRST_RUN_STORAGE_KEY}:${role}`;
}

/** The server-remembered welcome for Members and Operators (Prompt 10). */
export const ROLE_WELCOME: Record<"member" | "operator", { title: string; see: string; can: string; cannot: string }> = {
  member: {
    title: "Welcome to Vistrial",
    see: "You will see your leads, what Vistrial has done for the business, and your results.",
    can: "You can follow any lead's case file, and approve messages if the owner lets you.",
    cannot: "You cannot change setup or settings; the owner and your Vistrial team look after those.",
  },
  operator: {
    title: "Welcome to Vistrial",
    see: "You will see the leads assigned to you and the ones nobody has picked up yet, each with a case file.",
    can: "You can call, work your leads, and log what happened so the next step is clear.",
    cannot: "You will not see results, billing, or setup; those are for the owner.",
  },
};
