/**
 * Builds an organization's export in the background: reads its records a page at a time, writes the
 * files, and stores one .zip. Internal only; started by exports.start.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { EXPORT_ROW_LIMIT, EXPORT_TABLES, exportFiles, type ExportData } from "./lib/exportShape";
import { zip } from "./lib/zip";

export const build = internalAction({
  args: { exportId: v.id("organizationExports") },
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.runQuery(internal.exports.job, { exportId: args.exportId });
    if (!job) return null;
    try {
      const cut: string[] = [];
      const readAll = async (table: string) => {
        const rows: unknown[] = [];
        let cursor: string | null = null;
        for (;;) {
          const result: { rows: unknown[]; done: boolean; cursor: string } = await ctx.runQuery(internal.exports.page, { workspaceId: job.workspaceId, table, cursor });
          rows.push(...result.rows);
          if (result.done) break;
          if (rows.length >= EXPORT_ROW_LIMIT) {
            cut.push(table);
            break;
          }
          cursor = result.cursor;
        }
        return rows;
      };
      const tables: Record<string, unknown[]> = {};
      for (const { table } of EXPORT_TABLES) tables[table] = await readAll(table);
      const data: ExportData = {
        organization: { name: job.name, exportedAt: Date.now() },
        tables,
        assetVersions: (await readAll("assetVersions")) as ExportData["assetVersions"],
        offerVersions: await readAll("offerCardVersions"),
        brandKitVersions: await readAll("brandKitVersions"),
        cut,
      };
      const bytes = zip(exportFiles(data));
      const storageId = await ctx.storage.store(new Blob([bytes as BlobPart], { type: "application/zip" }));
      const records = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
      await ctx.runMutation(internal.exports.finish, { exportId: args.exportId, storageId, bytes: bytes.length, records });
    } catch {
      await ctx.runMutation(internal.exports.fail, { exportId: args.exportId });
    }
    return null;
  },
});
