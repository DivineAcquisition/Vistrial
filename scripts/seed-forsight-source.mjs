#!/usr/bin/env node
/**
 * Point a workspace at its Forsight source. This is an internal operator
 * action on purpose: no screen in Forsight ever asks anyone for a base id, a
 * key, or a field name, and clients never see this.
 *
 * Runs against the database with the service-role key, because members have no
 * write path to forsight_sources by design.
 *
 *   node scripts/seed-forsight-source.mjs \
 *     --org-slug divine-acquisition \
 *     --airtable-base appXXXXXXXXXXXXXX \
 *     --label "DA Pipeline — Client Acquisition"
 *
 * Optional flags:
 *   --org-id <uuid>              instead of --org-slug
 *   --missing leads,creatives    tables this base does not have
 *   --meta-ad-account act_123    also record a Meta ad account for this workspace
 *   --dry-run                    print what would be written and stop
 */
import { createClient } from "@supabase/supabase-js";

const DATASET_COLUMNS = {
  leads: "airtable_leads_table",
  creatives: "airtable_creatives_table",
  weeklySummary: "airtable_weekly_summary_table",
  touches: "airtable_touches_table",
};

const DEFAULT_TABLES = {
  leads: "Leads",
  creatives: "Creatives",
  weeklySummary: "Weekly Summary",
  touches: "Touches",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function die(message) {
  console.error(`seed-forsight-source: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ""
).trim();

if (!url || !serviceKey) {
  die("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
}

const orgSlug = typeof args["org-slug"] === "string" ? args["org-slug"] : null;
const orgId = typeof args["org-id"] === "string" ? args["org-id"] : null;
if (!orgSlug && !orgId) die("pass --org-slug or --org-id.");

const baseId = typeof args["airtable-base"] === "string" ? args["airtable-base"].trim() : "";
const metaAdAccount =
  typeof args["meta-ad-account"] === "string"
    ? args["meta-ad-account"].trim()
    : (process.env.META_AD_ACCOUNT_ID || "").trim();

if (!baseId && !metaAdAccount) {
  die("nothing to write: pass --airtable-base, --meta-ad-account, or both.");
}

const missing = new Set(
  typeof args.missing === "string"
    ? args.missing
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : []
);
for (const name of missing) {
  if (!DATASET_COLUMNS[name]) {
    die(`unknown dataset "${name}". Known: ${Object.keys(DATASET_COLUMNS).join(", ")}.`);
  }
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const orgQuery = db.from("organizations").select("id, name, slug");
const { data: org, error: orgError } = await (orgId
  ? orgQuery.eq("id", orgId)
  : orgQuery.eq("slug", orgSlug)
).maybeSingle();

if (orgError) die(`could not read organizations: ${orgError.message}`);
if (!org) die(`no workspace matched ${orgId ? `id ${orgId}` : `slug ${orgSlug}`}.`);

const rows = [];

if (baseId) {
  const tables = {};
  for (const [dataset, column] of Object.entries(DATASET_COLUMNS)) {
    tables[column] = missing.has(dataset) ? null : DEFAULT_TABLES[dataset];
  }
  rows.push({
    org_id: org.id,
    source_type: "airtable",
    status: "active",
    label: typeof args.label === "string" ? args.label : null,
    airtable_base_id: baseId,
    ...tables,
  });
}

if (metaAdAccount) {
  rows.push({
    org_id: org.id,
    source_type: "meta_ads",
    status: "active",
    label: typeof args["meta-label"] === "string" ? args["meta-label"] : null,
    meta_ad_account_id: metaAdAccount.startsWith("act_") ? metaAdAccount : `act_${metaAdAccount}`,
  });
}

console.log(`Workspace: ${org.name} (${org.slug}, ${org.id})`);
for (const row of rows) {
  console.log(`  ${row.source_type}: ${JSON.stringify(row, null, 2)}`);
}

if (args["dry-run"]) {
  console.log("Dry run. Nothing written.");
  process.exit(0);
}

const { error } = await db
  .from("forsight_sources")
  .upsert(rows, { onConflict: "org_id,source_type" });

if (error) die(`upsert failed: ${error.message}`);

console.log(`Wrote ${rows.length} source record${rows.length === 1 ? "" : "s"}.`);
