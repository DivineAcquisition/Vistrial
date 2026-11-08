/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapters_index from "../adapters/index.js";
import type * as adapters_links from "../adapters/links.js";
import type * as adapters_metaAdLibrary from "../adapters/metaAdLibrary.js";
import type * as adapters_oembed from "../adapters/oembed.js";
import type * as adapters_types from "../adapters/types.js";
import type * as adapters_web from "../adapters/web.js";
import type * as adapters_youtube from "../adapters/youtube.js";
import type * as agentFolder from "../agentFolder.js";
import type * as agentWaitlist from "../agentWaitlist.js";
import type * as agentsMigration from "../agentsMigration.js";
import type * as assets from "../assets.js";
import type * as billing from "../billing.js";
import type * as billingActions from "../billingActions.js";
import type * as catalog from "../catalog.js";
import type * as collections from "../collections.js";
import type * as controls from "../controls.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as facts from "../facts.js";
import type * as feedback from "../feedback.js";
import type * as files from "../files.js";
import type * as followups from "../followups.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as intake from "../intake.js";
import type * as leads from "../leads.js";
import type * as leadsMigration from "../leadsMigration.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_agents from "../lib/agents.js";
import type * as lib_assetStatus from "../lib/assetStatus.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authIssuers from "../lib/authIssuers.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_builders from "../lib/builders.js";
import type * as lib_canSeeLead from "../lib/canSeeLead.js";
import type * as lib_capRows from "../lib/capRows.js";
import type * as lib_caps from "../lib/caps.js";
import type * as lib_consent from "../lib/consent.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_estimate from "../lib/estimate.js";
import type * as lib_evidence from "../lib/evidence.js";
import type * as lib_factShapes from "../lib/factShapes.js";
import type * as lib_facts from "../lib/facts.js";
import type * as lib_guard from "../lib/guard.js";
import type * as lib_intake from "../lib/intake.js";
import type * as lib_leadBuilders from "../lib/leadBuilders.js";
import type * as lib_leadGuard from "../lib/leadGuard.js";
import type * as lib_metaGraph from "../lib/metaGraph.js";
import type * as lib_modelRouter from "../lib/modelRouter.js";
import type * as lib_newWorkspace from "../lib/newWorkspace.js";
import type * as lib_phones from "../lib/phones.js";
import type * as lib_registry from "../lib/registry.js";
import type * as lib_researchShapes from "../lib/researchShapes.js";
import type * as lib_resultsCsv from "../lib/resultsCsv.js";
import type * as lib_seedSpine from "../lib/seedSpine.js";
import type * as lib_skills from "../lib/skills.js";
import type * as lib_sourceRefs from "../lib/sourceRefs.js";
import type * as lib_submissionEmail from "../lib/submissionEmail.js";
import type * as lib_token from "../lib/token.js";
import type * as lib_toolRouter from "../lib/toolRouter.js";
import type * as merges from "../merges.js";
import type * as metaAds from "../metaAds.js";
import type * as people from "../people.js";
import type * as perf from "../perf.js";
import type * as platform from "../platform.js";
import type * as profile from "../profile.js";
import type * as publicSubmissions from "../publicSubmissions.js";
import type * as records from "../records.js";
import type * as research from "../research.js";
import type * as resultUploads from "../resultUploads.js";
import type * as reviewer from "../reviewer.js";
import type * as runs from "../runs.js";
import type * as seed from "../seed.js";
import type * as skills_marketIntelligence_checks from "../skills/marketIntelligence/checks.js";
import type * as skills_marketIntelligence_firstParty from "../skills/marketIntelligence/firstParty.js";
import type * as skills_marketIntelligence_index from "../skills/marketIntelligence/index.js";
import type * as skills_marketIntelligence_records from "../skills/marketIntelligence/records.js";
import type * as skills_marketIntelligence_render from "../skills/marketIntelligence/render.js";
import type * as skills_marketIntelligence_shapes from "../skills/marketIntelligence/shapes.js";
import type * as skills_marketIntelligence_tools from "../skills/marketIntelligence/tools.js";
import type * as skills_testEcho from "../skills/testEcho.js";
import type * as skills_testResearch from "../skills/testResearch.js";
import type * as skills_testSources from "../skills/testSources.js";
import type * as skills_types from "../skills/types.js";
import type * as sourceCheck from "../sourceCheck.js";
import type * as staff from "../staff.js";
import type * as staffAdmin from "../staffAdmin.js";
import type * as studio from "../studio.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "adapters/index": typeof adapters_index;
  "adapters/links": typeof adapters_links;
  "adapters/metaAdLibrary": typeof adapters_metaAdLibrary;
  "adapters/oembed": typeof adapters_oembed;
  "adapters/types": typeof adapters_types;
  "adapters/web": typeof adapters_web;
  "adapters/youtube": typeof adapters_youtube;
  agentFolder: typeof agentFolder;
  agentWaitlist: typeof agentWaitlist;
  agentsMigration: typeof agentsMigration;
  assets: typeof assets;
  billing: typeof billing;
  billingActions: typeof billingActions;
  catalog: typeof catalog;
  collections: typeof collections;
  controls: typeof controls;
  crons: typeof crons;
  events: typeof events;
  facts: typeof facts;
  feedback: typeof feedback;
  files: typeof files;
  followups: typeof followups;
  http: typeof http;
  imports: typeof imports;
  intake: typeof intake;
  leads: typeof leads;
  leadsMigration: typeof leadsMigration;
  "lib/access": typeof lib_access;
  "lib/agents": typeof lib_agents;
  "lib/assetStatus": typeof lib_assetStatus;
  "lib/audit": typeof lib_audit;
  "lib/authIssuers": typeof lib_authIssuers;
  "lib/billing": typeof lib_billing;
  "lib/builders": typeof lib_builders;
  "lib/canSeeLead": typeof lib_canSeeLead;
  "lib/capRows": typeof lib_capRows;
  "lib/caps": typeof lib_caps;
  "lib/consent": typeof lib_consent;
  "lib/errors": typeof lib_errors;
  "lib/estimate": typeof lib_estimate;
  "lib/evidence": typeof lib_evidence;
  "lib/factShapes": typeof lib_factShapes;
  "lib/facts": typeof lib_facts;
  "lib/guard": typeof lib_guard;
  "lib/intake": typeof lib_intake;
  "lib/leadBuilders": typeof lib_leadBuilders;
  "lib/leadGuard": typeof lib_leadGuard;
  "lib/metaGraph": typeof lib_metaGraph;
  "lib/modelRouter": typeof lib_modelRouter;
  "lib/newWorkspace": typeof lib_newWorkspace;
  "lib/phones": typeof lib_phones;
  "lib/registry": typeof lib_registry;
  "lib/researchShapes": typeof lib_researchShapes;
  "lib/resultsCsv": typeof lib_resultsCsv;
  "lib/seedSpine": typeof lib_seedSpine;
  "lib/skills": typeof lib_skills;
  "lib/sourceRefs": typeof lib_sourceRefs;
  "lib/submissionEmail": typeof lib_submissionEmail;
  "lib/token": typeof lib_token;
  "lib/toolRouter": typeof lib_toolRouter;
  merges: typeof merges;
  metaAds: typeof metaAds;
  people: typeof people;
  perf: typeof perf;
  platform: typeof platform;
  profile: typeof profile;
  publicSubmissions: typeof publicSubmissions;
  records: typeof records;
  research: typeof research;
  resultUploads: typeof resultUploads;
  reviewer: typeof reviewer;
  runs: typeof runs;
  seed: typeof seed;
  "skills/marketIntelligence/checks": typeof skills_marketIntelligence_checks;
  "skills/marketIntelligence/firstParty": typeof skills_marketIntelligence_firstParty;
  "skills/marketIntelligence/index": typeof skills_marketIntelligence_index;
  "skills/marketIntelligence/records": typeof skills_marketIntelligence_records;
  "skills/marketIntelligence/render": typeof skills_marketIntelligence_render;
  "skills/marketIntelligence/shapes": typeof skills_marketIntelligence_shapes;
  "skills/marketIntelligence/tools": typeof skills_marketIntelligence_tools;
  "skills/testEcho": typeof skills_testEcho;
  "skills/testResearch": typeof skills_testResearch;
  "skills/testSources": typeof skills_testSources;
  "skills/types": typeof skills_types;
  sourceCheck: typeof sourceCheck;
  staff: typeof staff;
  staffAdmin: typeof staffAdmin;
  studio: typeof studio;
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
