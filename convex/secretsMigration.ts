/**
 * Encrypts the credentials already stored as plaintext, in place, once `TOKEN_ENCRYPTION_KEY` is set
 * (docs/rebuild/integrations-setup.md, "Token encryption"). Run after the deploy and after setting the key:
 *
 *   npx convex run secretsMigration:encryptExisting '{}'
 *
 * It pages through each table in `SECRET_FIELDS`, schedules itself for the next page and the next table, and is
 * idempotent: a value already sealed with the current key is left alone, and one sealed with the previous key
 * (after a rotation) is sealed again with the current one. Without a key it changes nothing and says so. It never
 * logs a value.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { SECRET_FIELDS, encryptionReady, isSealed, needsReseal, openSecret, sealSecret, type SecretTable } from "./lib/secrets";

const TABLES = Object.keys(SECRET_FIELDS) as SecretTable[];
const PAGE = 100;

export const encryptExisting = internalMutation({
  args: { table: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ done: boolean; table: string | null; sealed: number; reason?: string }> => {
    if (!encryptionReady()) {
      console.warn("secretsMigration: TOKEN_ENCRYPTION_KEY is not set, so nothing was encrypted.");
      return { done: false, table: null, sealed: 0, reason: "no_key" };
    }
    const table = (args.table ?? TABLES[0]) as SecretTable;
    if (!TABLES.includes(table)) throw new Error("secretsMigration: unknown table.");
    const fields = SECRET_FIELDS[table] as readonly string[];
    const page = await ctx.db.query(table).paginate({ numItems: PAGE, cursor: args.cursor ?? null });
    let sealed = 0;
    for (const row of page.page) {
      const patch: Record<string, string> = {};
      for (const field of fields) {
        const value = (row as Record<string, unknown>)[field];
        if (typeof value !== "string" || !(await needsReseal(value))) continue;
        // A value sealed with the previous key is opened first, then sealed with the current one.
        patch[field] = await sealSecret(isSealed(value) ? await openSecret(value) : value);
      }
      if (Object.keys(patch).length) {
        await ctx.db.patch(row._id, patch);
        sealed += Object.keys(patch).length;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.secretsMigration.encryptExisting, { table, cursor: page.continueCursor });
      return { done: false, table, sealed };
    }
    const next = TABLES[TABLES.indexOf(table) + 1];
    if (next) {
      await ctx.scheduler.runAfter(0, internal.secretsMigration.encryptExisting, { table: next, cursor: null });
      return { done: false, table, sealed };
    }
    console.log("secretsMigration: every stored credential is encrypted with the current key.");
    return { done: true, table, sealed };
  },
});
