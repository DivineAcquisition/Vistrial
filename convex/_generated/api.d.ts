/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as directory from "../directory.js";
import type * as home from "../home.js";
import type * as homeRules from "../homeRules.js";
import type * as importDirectory from "../importDirectory.js";
import type * as importLive from "../importLive.js";
import type * as leadAccess from "../leadAccess.js";
import type * as live from "../live.js";
import type * as liveRows from "../liveRows.js";
import type * as notify from "../notify.js";
import type * as pause from "../pause.js";
import type * as privacy from "../privacy.js";
import type * as record from "../record.js";
import type * as redactText from "../redactText.js";
import type * as notifyRules from "../notifyRules.js";
import type * as rows from "../rows.js";
import type * as seatMap from "../seatMap.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  directory: typeof directory;
  home: typeof home;
  homeRules: typeof homeRules;
  importDirectory: typeof importDirectory;
  importLive: typeof importLive;
  leadAccess: typeof leadAccess;
  live: typeof live;
  liveRows: typeof liveRows;
  notify: typeof notify;
  notifyRules: typeof notifyRules;
  pause: typeof pause;
  privacy: typeof privacy;
  record: typeof record;
  redactText: typeof redactText;
  rows: typeof rows;
  seatMap: typeof seatMap;
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
