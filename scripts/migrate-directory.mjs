/**
 * One-time copy of workspaces, members, assignments, invites, and platform
 * staff from Supabase into Convex. Deletes nothing. Prints before-and-after counts.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_CONVEX_URL and DIRECTORY_IMPORT_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Directory migration was not run.`);
    process.exit(2);
  }
  return value;
}

async function allRows(db, table) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const convex = new ConvexHttpClient(required("NEXT_PUBLIC_CONVEX_URL"));
const key = required("DIRECTORY_IMPORT_KEY");

const before = {};
const tables = {
  workspaces: "organizations",
  members: "org_members",
  assignments: "workspace_assignments",
  invites: "org_invites",
  staff: "platform_staff",
};
const loaded = {};
for (const [bucket, table] of Object.entries(tables)) {
  loaded[bucket] = await allRows(supabase, table);
  before[table] = loaded[bucket].length;
}

async function send(partial) {
  await convex.mutation(anyApi.importDirectory.importBatch, {
    key,
    workspaces: partial.workspaces ?? [],
    members: partial.members ?? [],
    assignments: partial.assignments ?? [],
    invites: partial.invites ?? [],
    staff: partial.staff ?? [],
  });
}

for (const [bucket, rows] of Object.entries(loaded)) {
  for (let index = 0; index < rows.length; index += 40) {
    await send({ [bucket]: rows.slice(index, index + 40) });
  }
}

const after = await convex.mutation(anyApi.importDirectory.counts, { key });
console.log(JSON.stringify({ before, after, renamed: { da_operator: "placed_operator" } }, null, 2));
