/**
 * HighLevel behind the shared CRM adapter. It wraps what is already merged and tested
 * (`lib/crmActions.ts`, `lib/highLevel.ts`); nothing here changes how HighLevel is read or written.
 */

import { ACTION_KINDS, isAllowedWrite, reverseOf, writeRequest } from "../crmActions";
import type { CrmAdapter } from "./adapter";

export const highLevelAdapter: CrmAdapter = {
  provider: "highlevel",
  label: "HighLevel",
  capabilities: {
    appointments: true,
    // HighLevel has no stage history endpoint: moves are found by comparing one read with the last.
    stageHistory: "diffed",
    actions: ACTION_KINDS,
  },
  writeRequest,
  isAllowedWrite,
  reverseOf,
};
