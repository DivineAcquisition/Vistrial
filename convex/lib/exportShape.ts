/**
 * What an organization's export holds, and what it never does. The list of tables is written out here, so a
 * new table is not exported until someone decides it should be. Connections, tokens, people, invitations,
 * billing and the audit log are not on the list.
 */
import { safeName, type ZipFile } from "./zip";

/** The tables an export reads, each by its `by_workspace` index, and the folder its rows go in. */
export const EXPORT_TABLES = [
  { table: "clients", file: "clients" },
  { table: "researchProjects", file: "research" },
  { table: "assets", file: "reports-and-assets" },
  { table: "offerCards", file: "offers" },
  { table: "decisions", file: "decisions" },
  { table: "agentTasks", file: "tasks" },
  { table: "growthGoals", file: "goals" },
  { table: "resultUploads", file: "results" },
  { table: "callTranscripts", file: "transcripts" },
  { table: "brandKits", file: "brand-kits" },
  { table: "creativeRequests", file: "creative-requests" },
  { table: "creativeTests", file: "creative-tests" },
  { table: "teardownRequests", file: "page-teardowns" },
  { table: "profileVersions", file: "business-profile" },
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number]["table"];

/** The most rows read from one table. An export that reaches it says so in its README. */
export const EXPORT_ROW_LIMIT = 2000;
export const EXPORT_PAGE = 100;

/**
 * Keys that never leave: anything that could be a credential, a stored file's id, or who a person is
 * beyond the name written on a record.
 */
const NEVER = /token|secret|password|apikey|api_key|credential|authorization|cookie|hash|storageid|userid|email|phone|^addedby$|^createdby$|^decidedby$|^approvedby$|^uploadedby$|^requestedby$|^actorid$|^memberid$|^ownermemberid$/i;

/** A copy of a stored row that is safe to hand over: the keys above are dropped at every depth. */
export function exportable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(exportable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (key === "workspaceId" || NEVER.test(key)) continue;
      out[key] = exportable(inner);
    }
    return out;
  }
  return value;
}

export type ExportData = {
  organization: { name: string; exportedAt: number };
  tables: Record<string, unknown[]>;
  /** The written versions of each report or asset, newest last. */
  assetVersions: { assetId: string; version: number; body?: string; notes?: string }[];
  offerVersions: unknown[];
  brandKitVersions: unknown[];
  cut: string[];
};

const day = (time: number) => new Date(time).toISOString().slice(0, 10);

/** The files of an export: every table as JSON, and reports and transcripts as text a person can read. */
export function exportFiles(data: ExportData): ZipFile[] {
  const files: ZipFile[] = [];
  const counts: string[] = [];
  for (const { table, file } of EXPORT_TABLES) {
    const rows = data.tables[table] ?? [];
    counts.push(`- ${file}.json: ${rows.length}`);
    files.push({ path: `data/${file}.json`, text: JSON.stringify(rows, null, 2) });
  }
  files.push({ path: "data/report-versions.json", text: JSON.stringify(data.assetVersions, null, 2) });
  files.push({ path: "data/offer-versions.json", text: JSON.stringify(data.offerVersions, null, 2) });
  files.push({ path: "data/brand-kit-versions.json", text: JSON.stringify(data.brandKitVersions, null, 2) });

  const assets = (data.tables.assets ?? []) as { _id: string; title?: string; kind?: string; currentVersion?: number }[];
  for (const asset of assets) {
    const versions = data.assetVersions.filter((row) => row.assetId === asset._id && row.body);
    const latest = versions.find((row) => row.version === asset.currentVersion) ?? versions[versions.length - 1];
    if (!latest?.body) continue;
    files.push({ path: `reports/${safeName(asset.title ?? "", "report")}.md`, text: latest.body });
  }
  const transcripts = (data.tables.callTranscripts ?? []) as { title?: string; callDate?: string; text?: string }[];
  for (const row of transcripts) {
    if (!row.text) continue;
    files.push({ path: `transcripts/${safeName(`${row.callDate ?? ""} ${row.title ?? ""}`, "transcript")}.txt`, text: row.text });
  }

  files.unshift({
    path: "README.txt",
    text: [
      `${data.organization.name}: export from Vistrial, ${day(data.organization.exportedAt)}`,
      "",
      "data/        every record as JSON, one file per kind",
      "reports/     the current version of each report and written asset, as Markdown",
      "transcripts/ each call transcript, as plain text",
      "",
      "What is in it:",
      ...counts,
      "",
      "What is not in it: connected accounts and their tokens, people and invitations, billing,",
      "the audit log, uploaded files and images themselves (logos, creative images, screenshots),",
      "and anything that belongs to another organization.",
      ...(data.cut.length ? ["", `Cut short at ${EXPORT_ROW_LIMIT} records: ${data.cut.join(", ")}. Contact us for the rest.`] : []),
      "",
    ].join("\n"),
  });
  return files;
}
