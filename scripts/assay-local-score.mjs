// Run Assay's silent first scoring against a LOCAL test database through psql,
// then print the switch report (legacy bands before, Assay tiers after).
// Local test databases only; production scoring runs from the queue.
//   node scripts/assay-local-score.mjs [database]
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { scoreWorkspace } = await jiti.import(path.join(root, "src/lib/assay/score-org.ts"));

const database = process.argv[2] ?? "assay_test";

function sql(text) {
  const out = execFileSync("sudo", ["-u", "postgres", "psql", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", "-"], {
    input: text,
    maxBuffer: 512 * 1024 * 1024,
  });
  return out.toString().trim();
}

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes("$q$")) throw new Error("unexpected quote marker");
  return `$q$${text}$q$`;
}

const store = {
  async config(orgId) {
    const raw = JSON.parse(sql(`SELECT public.config_effective_at(${quote(orgId)}::uuid);`));
    return { values: raw.values ?? {}, slug: raw.template_slug ?? null, version: raw.version ?? "" };
  },
  async context(orgId) {
    return JSON.parse(sql(`SELECT public.assay_org_context(${quote(orgId)}::uuid);`));
  },
  async leads(orgId, page) {
    const ids = page.ids ? `ARRAY[${page.ids.map((id) => `${quote(id)}::uuid`).join(",")}]` : "NULL";
    return JSON.parse(sql(`SELECT public.assay_lead_inputs(${quote(orgId)}::uuid, ${ids}, ${page.after ? `${quote(page.after)}::uuid` : "NULL"}, ${page.limit});`));
  },
  async write(orgId, rows) {
    return Number(sql(`SELECT public.assay_write_scores(${quote(orgId)}::uuid, ${quote(rows)}::jsonb);`));
  },
};

const orgs = sql("SELECT string_agg(org_id::text, ',') FROM public.assay_jobs WHERE cause = 'migration' AND status = 'pending';").split(",").filter(Boolean);
for (const orgId of orgs) {
  const run = await scoreWorkspace(store, orgId, { cause: "migration", historic: true });
  sql(`
    UPDATE public.assay_migration_runs SET ignored_fields = ignored_fields || ${quote(run.ignoredFields)}::jsonb WHERE org_id = ${quote(orgId)}::uuid;
    SELECT public.assay_finish_migration(${quote(orgId)}::uuid, ${run.scored});
    UPDATE public.assay_jobs SET status = 'done' WHERE org_id = ${quote(orgId)}::uuid AND dedupe_key = 'migration:assay-v1';
  `);
  if (run.problems.length) console.error(orgId, run.problems);
}

console.log(sql(`
  SELECT jsonb_pretty(jsonb_agg(jsonb_build_object(
    'workspace', o.name,
    'before', r.before_counts,
    'after', r.after_counts,
    'scored', r.leads_scored,
    'ignored_fields', (SELECT jsonb_agg(DISTINCT f ->> 'source') FROM jsonb_array_elements(r.ignored_fields) f)
  ) ORDER BY o.name))
  FROM public.assay_migration_runs r JOIN public.organizations o ON o.id = r.org_id;
`));
