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
    title: "Three screens",
    body: "The team works the list. The closer reads the person. You open the report to see if it is working. Everything else is under More.",
  },
  owner: {
    title: "Is this working",
    body: "This report is how many leads became clients, whether the team is using the system, where deals are dying, and what to do about it.",
  },
};

export function firstRunStorageKey(role: OrgRole): string {
  return `${FIRST_RUN_STORAGE_KEY}:${role}`;
}
