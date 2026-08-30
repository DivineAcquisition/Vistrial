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
    title: "How this list works",
    body: "Start at the top. People who have waited too long stay there until someone contacts them. Open a person, talk to them, then log what happened.",
  },
  closer: {
    title: "How this list works",
    body: "The people to work today are on the queue. Open a person for the brief and any open objections before you dial. Log what happened after every call.",
  },
  admin: {
    title: "Where things live",
    body: "The queue is what the team works today. Connect apps under Settings, then Integrations. How ready someone has to be, and how follow-up is written, sit behind Advanced. Leave those unless this business genuinely differs.",
  },
  owner: {
    title: "Where things live",
    body: "The queue is what the team works today. Connect apps under Settings, then Integrations. How ready someone has to be, and how follow-up is written, sit behind Advanced. Leave those unless this business genuinely differs.",
  },
};

export function firstRunStorageKey(role: OrgRole): string {
  return `${FIRST_RUN_STORAGE_KEY}:${role}`;
}
