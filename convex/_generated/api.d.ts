/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as agents from "../agents.js";
import type * as marketing from "../marketing.js";
import type * as staff from "../staff.js";
import type * as workspace from "../workspace.js";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  marketing: typeof marketing;
  staff: typeof staff;
  workspace: typeof workspace;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
