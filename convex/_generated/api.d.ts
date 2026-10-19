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
import type * as importDirectory from "../importDirectory.js";
import type * as importLive from "../importLive.js";
import type * as live from "../live.js";
import type * as liveRows from "../liveRows.js";
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
  importDirectory: typeof importDirectory;
  importLive: typeof importLive;
  live: typeof live;
  liveRows: typeof liveRows;
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
