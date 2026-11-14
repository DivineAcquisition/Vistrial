/**
 * The database a Member or Viewer reads through. Every row that belongs to a client (its own `clientId`,
 * or its parent's: a run's steps, an asset's versions, a project's sources) is only there when the member
 * may see that client; otherwise `get` answers null and lists leave it out, exactly as if it did not exist.
 * Rows that belong to no client are the organization's own work, hidden only from a member for whom that
 * was switched off.
 *
 * The builders (lib/builders.ts) hand this to the handler in place of `ctx.db`, so a function cannot
 * forget the check. Owners and Admins see everything and get the plain database. Writes are not changed:
 * a handler finds a row before it changes it, and cannot find one that is hidden.
 */
import type { GenericId } from "convex/values";

import type { TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ClientScope } from "./clients";

type AnyDoc = Record<string, unknown> & { _id: GenericId<string> };
type Db = QueryCtx["db"];

/** Tables that say which client they are for. A missing `clientId` means the organization itself. */
const DIRECT: readonly TableNames[] = [
  "agentRuns",
  "agentTasks",
  "approvals",
  "assets",
  "brandKits",
  "briefingItems",
  "callTranscripts",
  "clientAssignments",
  "creativeRequests",
  "crmActions",
  "crmActivities",
  "crmConnections",
  "crmContacts",
  "crmDeals",
  "crmPipelines",
  "crmSummaries",
  "crmSyncRuns",
  "dealmakerPauses",
  "dealmakerSettings",
  "decisions",
  "intakes",
  "integrationConnections",
  "metaConnections",
  "offerCards",
  "personalNotes",
  "playbookItems",
  "playbookLessons",
  "playbookStudies",
  "researchProjects",
  "resultUploads",
  "siteCaptures",
  "teardownRequests",
];

/** Tables that belong to whatever their parent belongs to. The first pointer that is set decides. */
const VIA: Partial<Record<TableNames, readonly [field: string, parent: TableNames][]>> = {
  assetVersions: [["assetId", "assets"]],
  evidence: [["assetVersionId", "assetVersions"]],
  feedback: [["assetId", "assets"]],
  creativeImages: [["assetId", "assets"]],
  creativeTests: [["kitId", "brandKits"]],
  brandKitVersions: [["kitId", "brandKits"]],
  offerCardVersions: [["cardId", "offerCards"]],
  intakeMessages: [["intakeId", "intakes"]],
  runSteps: [["runId", "agentRuns"]],
  runArtifacts: [["runId", "agentRuns"]],
  sourceRefs: [["projectId", "researchProjects"]],
  sourceStatus: [["projectId", "researchProjects"]],
  sessionChats: [["projectId", "researchProjects"]],
  sessionFiles: [["projectId", "researchProjects"], ["intakeId", "intakes"]],
  collectionItems: [["sourceRefId", "sourceRefs"]],
  pageReadJobs: [["runId", "agentRuns"], ["captureId", "siteCaptures"]],
  pageReads: [["jobId", "pageReadJobs"]],
};

/** A collection with no project is a person's own list; what is in it is checked item by item. */
const FREE_WHEN_UNPOINTED: readonly TableNames[] = ["collections"];
const VIA_OPTIONAL: Partial<Record<TableNames, readonly [field: string, parent: TableNames][]>> = { collections: [["projectId", "researchProjects"]] };

export const GUARDED: readonly TableNames[] = ["clients", ...DIRECT, ...(Object.keys(VIA) as TableNames[]), ...FREE_WHEN_UNPOINTED];
const GUARDED_SET = new Set<string>(GUARDED);

const ALWAYS = Symbol("visible to every member");
type Owner = GenericId<"clients"> | undefined | typeof ALWAYS;

export function guardDb<T extends Db | MutationCtx["db"]>(db: T, scope: ClientScope): T {
  if (scope.all) return db;
  const raw = db as Db;
  const known = new Map<string, Owner>();

  const tableOf = (id: GenericId<string>): TableNames | null => {
    for (const table of GUARDED) if (raw.normalizeId(table, id as string) !== null) return table;
    return null;
  };

  /** The client a row belongs to: `undefined` for the organization itself. */
  async function ownerOf(table: TableNames, doc: AnyDoc): Promise<Owner> {
    if (table === "clients") return doc._id as GenericId<"clients">;
    if (DIRECT.includes(table)) {
      if (doc.clientId) return doc.clientId as GenericId<"clients">;
      // An asset takes its run's client when it does not name one itself.
      if (table === "assets" && doc.createdByRun) return ownerById("agentRuns", doc.createdByRun as GenericId<string>);
      return undefined;
    }
    const pointers = VIA[table] ?? VIA_OPTIONAL[table] ?? [];
    for (const [field, parent] of pointers) {
      if (doc[field]) return ownerById(parent, doc[field] as GenericId<string>);
    }
    return FREE_WHEN_UNPOINTED.includes(table) ? ALWAYS : undefined;
  }

  async function ownerById(table: TableNames, id: GenericId<string>): Promise<Owner> {
    const key = id as string;
    if (known.has(key)) return known.get(key);
    const doc = (await raw.get(id as never)) as AnyDoc | null;
    // A parent that is gone cannot vouch for its children: treat them as the organization's own.
    const owner = doc ? await ownerOf(table, doc) : undefined;
    known.set(key, owner);
    return owner;
  }

  async function visible(table: TableNames, doc: AnyDoc): Promise<boolean> {
    const owner = await ownerOf(table, doc);
    return owner === ALWAYS ? true : scope.sees(owner);
  }

  async function keep<D>(table: TableNames, rows: D[]): Promise<D[]> {
    const out: D[] = [];
    for (const row of rows) if (await visible(table, row as unknown as AnyDoc)) out.push(row);
    return out;
  }

  /** A query on a guarded table: the same chain, with hidden rows taken out of whatever it returns. */
  function guardQuery(query: object, table: TableNames): unknown {
    return new Proxy(query, {
      get(target, prop) {
        const inner = target as Record<string | symbol, unknown> & AsyncIterable<AnyDoc>;
        if (prop === "collect") return async () => keep(table, await (inner.collect as () => Promise<AnyDoc[]>)());
        if (prop === "take") return async (n: number) => keep(table, await (inner.take as (n: number) => Promise<AnyDoc[]>)(n));
        if (prop === "unique") {
          return async () => {
            const row = await (inner.unique as () => Promise<AnyDoc | null>)();
            return row && (await visible(table, row)) ? row : null;
          };
        }
        if (prop === "first") {
          return async () => {
            for await (const row of inner) if (await visible(table, row)) return row;
            return null;
          };
        }
        if (prop === "paginate") {
          return async (options: unknown) => {
            const page = await (inner.paginate as (options: unknown) => Promise<{ page: AnyDoc[] }>)(options);
            return { ...page, page: await keep(table, page.page) };
          };
        }
        if (prop === Symbol.asyncIterator) {
          return async function* () {
            for await (const row of inner) if (await visible(table, row)) yield row;
          };
        }
        const value = inner[prop];
        if (typeof value !== "function") return value;
        // withIndex, order, filter and the rest return the next link of the chain: keep guarding it.
        return (...args: unknown[]) => {
          const next = (value as (...args: unknown[]) => unknown).apply(target, args);
          return next && typeof next === "object" ? guardQuery(next as object, table) : next;
        };
      },
    });
  }

  return new Proxy(db, {
    get(target, prop) {
      if (prop === "get") {
        return async (...args: unknown[]) => {
          const doc = (await (raw.get as (...args: unknown[]) => Promise<AnyDoc | null>)(...args)) as AnyDoc | null;
          if (!doc) return doc;
          const table = args.length > 1 ? (args[0] as TableNames) : tableOf(doc._id);
          if (!table || !GUARDED_SET.has(table)) return doc;
          return (await visible(table, doc)) ? doc : null;
        };
      }
      if (prop === "query") {
        return (table: TableNames) => {
          const query = raw.query(table);
          return GUARDED_SET.has(table) ? guardQuery(query, table) : query;
        };
      }
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;
}
