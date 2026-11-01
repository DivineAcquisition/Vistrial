/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentsMigration from "../agentsMigration.js";
import type * as assets from "../assets.js";
import type * as catalog from "../catalog.js";
import type * as controls from "../controls.js";
import type * as events from "../events.js";
import type * as imports from "../imports.js";
import type * as leads from "../leads.js";
import type * as leadsMigration from "../leadsMigration.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_agents from "../lib/agents.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authIssuers from "../lib/authIssuers.js";
import type * as lib_builders from "../lib/builders.js";
import type * as lib_canSeeLead from "../lib/canSeeLead.js";
import type * as lib_caps from "../lib/caps.js";
import type * as lib_consent from "../lib/consent.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_evidence from "../lib/evidence.js";
import type * as lib_guard from "../lib/guard.js";
import type * as lib_leadBuilders from "../lib/leadBuilders.js";
import type * as lib_leadGuard from "../lib/leadGuard.js";
import type * as lib_modelRouter from "../lib/modelRouter.js";
import type * as lib_phones from "../lib/phones.js";
import type * as lib_registry from "../lib/registry.js";
import type * as lib_seedSpine from "../lib/seedSpine.js";
import type * as lib_skills from "../lib/skills.js";
import type * as lib_token from "../lib/token.js";
import type * as lib_toolRouter from "../lib/toolRouter.js";
import type * as merges from "../merges.js";
import type * as people from "../people.js";
import type * as perf from "../perf.js";
import type * as platform from "../platform.js";
import type * as profile from "../profile.js";
import type * as records from "../records.js";
import type * as runs from "../runs.js";
import type * as seed from "../seed.js";
import type * as skills_testEcho from "../skills/testEcho.js";
import type * as skills_testResearch from "../skills/testResearch.js";
import type * as skills_types from "../skills/types.js";
import type * as staff from "../staff.js";
import type * as staffAdmin from "../staffAdmin.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentsMigration: typeof agentsMigration;
  assets: typeof assets;
  catalog: typeof catalog;
  controls: typeof controls;
  events: typeof events;
  imports: typeof imports;
  leads: typeof leads;
  leadsMigration: typeof leadsMigration;
  "lib/access": typeof lib_access;
  "lib/agents": typeof lib_agents;
  "lib/audit": typeof lib_audit;
  "lib/authIssuers": typeof lib_authIssuers;
  "lib/builders": typeof lib_builders;
  "lib/canSeeLead": typeof lib_canSeeLead;
  "lib/caps": typeof lib_caps;
  "lib/consent": typeof lib_consent;
  "lib/errors": typeof lib_errors;
  "lib/evidence": typeof lib_evidence;
  "lib/guard": typeof lib_guard;
  "lib/leadBuilders": typeof lib_leadBuilders;
  "lib/leadGuard": typeof lib_leadGuard;
  "lib/modelRouter": typeof lib_modelRouter;
  "lib/phones": typeof lib_phones;
  "lib/registry": typeof lib_registry;
  "lib/seedSpine": typeof lib_seedSpine;
  "lib/skills": typeof lib_skills;
  "lib/token": typeof lib_token;
  "lib/toolRouter": typeof lib_toolRouter;
  merges: typeof merges;
  people: typeof people;
  perf: typeof perf;
  platform: typeof platform;
  profile: typeof profile;
  records: typeof records;
  runs: typeof runs;
  seed: typeof seed;
  "skills/testEcho": typeof skills_testEcho;
  "skills/testResearch": typeof skills_testResearch;
  "skills/types": typeof skills_types;
  staff: typeof staff;
  staffAdmin: typeof staffAdmin;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
