#!/usr/bin/env node
// Runs the same schema suite as supabase/tests/verify.sh without sudo or a
// system Postgres cluster.
//
// verify.sh needs `sudo -u postgres` and a pg_ctlcluster install, so it cannot
// run in a sandboxed checkout or in CI. This boots a throwaway Postgres from an
// npm-published binary instead, applies the auth stub, every migration, the
// seed, and every verify-*.sql, then throws the cluster away.
//
// Each SQL file gets its own connection, matching the one-psql-process-per-file
// shape of verify.sh. Without that, a `set_config(..., false)` in one file
// leaks into the next and tests fail in ways that have nothing to do with the
// schema.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Match supabase/config.toml's db.major_version. Testing against a different
// major is worse than not testing: it passes on syntax the real database
// rejects, and vice versa. Every published version carries a -beta tag, so a
// bare major range resolves to nothing and the range needs the -0 floor.
const PG_PACKAGE = process.env.VISTRIAL_LOCAL_PG ?? "embedded-postgres@>=17.0.0-0 <18.0.0-0";
const PORT = Number(process.env.VISTRIAL_LOCAL_PG_PORT ?? 55433);

const workdir = mkdtempSync(path.join(tmpdir(), "vistrial-schema-"));
let stopServer = () => {};

function fail(message) {
  console.error(`\n${message}`);
  stopServer();
  rmSync(workdir, { recursive: true, force: true });
  process.exit(1);
}

console.log(`Fetching ${PG_PACKAGE} (cached by npm after the first run)...`);
writeFileSync(path.join(workdir, "package.json"), JSON.stringify({ private: true }));
try {
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", PG_PACKAGE], {
    cwd: workdir,
    stdio: "inherit",
  });
} catch {
  fail(`Could not install ${PG_PACKAGE}. This script needs network access on first run.`);
}

const bin = path.join(workdir, "node_modules/@embedded-postgres/linux-x64/native/bin");
if (!existsSync(bin)) {
  fail(`No Postgres binaries at ${bin}. Only linux-x64 is wired up here.`);
}

const dataDir = path.join(workdir, "data");
const pwFile = path.join(workdir, "pw");
writeFileSync(pwFile, "postgres");

console.log("Initialising a throwaway cluster...");
execFileSync(path.join(bin, "initdb"), ["-D", dataDir, "-U", "postgres", `--pwfile=${pwFile}`, "-A", "trust"], {
  stdio: ["ignore", "ignore", "inherit"],
});

execFileSync(
  path.join(bin, "pg_ctl"),
  ["-D", dataDir, "-o", `-p ${PORT} -k ${workdir}`, "-l", path.join(workdir, "pg.log"), "-w", "start"],
  { stdio: ["ignore", "ignore", "inherit"] }
);
stopServer = () => {
  try {
    execFileSync(path.join(bin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      stdio: "ignore",
    });
  } catch {
    // Already down, or never came up. Either way the temp dir goes next.
  }
};

const { default: pg } = await import(path.join(workdir, "node_modules/pg/lib/index.js"));

const DB = "vistrial_schema_test";
async function connect(database) {
  const client = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", database });
  await client.connect();
  return client;
}

{
  const admin = await connect("postgres");
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
}

async function runFile(file) {
  const client = await connect(DB);
  try {
    await client.query(readFileSync(file, "utf8"));
    return null;
  } catch (error) {
    return error.message.split("\n")[0];
  } finally {
    await client.end();
  }
}

const failures = [];

async function step(label, file, { quiet = false } = {}) {
  const error = await runFile(file);
  if (error) {
    failures.push({ label, error });
    console.log(`FAIL  ${label}`);
    console.log(`      ${error}`);
  } else if (!quiet) {
    console.log(`PASS  ${label}`);
  }
}

console.log("\nAuth stub...");
await step("local-auth-stub.sql", path.join(ROOT, "supabase/tests/local-auth-stub.sql"));

console.log("Migrations...");
const migrations = readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of migrations) {
  await step(`migration ${file}`, path.join(ROOT, "supabase/migrations", file), { quiet: true });
}
console.log(`      ${migrations.length} migrations applied`);

console.log("Seed...");
await step("seed.sql", path.join(ROOT, "supabase/seed.sql"));

// Order comes from verify.sh rather than a glob: several checks build on
// fixtures an earlier file created, so alphabetical order fails them for
// reasons that have nothing to do with the schema. Reading the order out of
// verify.sh also means a check added there is picked up here for free.
const verifyScript = readFileSync(path.join(ROOT, "supabase/tests/verify.sh"), "utf8");
const checks = [...verifyScript.matchAll(/tests\/(verify-[\w-]+\.sql)"/g)].map((m) => m[1]);

const onDisk = readdirSync(path.join(ROOT, "supabase/tests"))
  .filter((f) => f.startsWith("verify-") && f.endsWith(".sql"))
  .sort();
const unreferenced = onDisk.filter((f) => !checks.includes(f));
if (unreferenced.length > 0) {
  failures.push({
    label: "verify.sh coverage",
    error: `never run by verify.sh: ${unreferenced.join(", ")}`,
  });
  console.log(`FAIL  verify.sh never runs: ${unreferenced.join(", ")}`);
}

console.log(`Checks (${checks.length}, in verify.sh order)...`);
for (const file of checks) {
  await step(file, path.join(ROOT, "supabase/tests", file));
}

console.log("\nRow security on every org-scoped table...");
{
  const client = await connect(DB);
  const { rows } = await client.query(`
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
     ORDER BY 1`);
  await client.end();
  if (rows.length > 0) {
    failures.push({ label: "row security", error: `RLS off on: ${rows.map((r) => r.relname).join(", ")}` });
    console.log(`FAIL  RLS off on: ${rows.map((r) => r.relname).join(", ")}`);
  } else {
    console.log("PASS  every table with an org_id reports row security enabled");
  }
}

stopServer();
rmSync(workdir, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} step(s) failed:`);
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}

console.log("\nOK: migrations, seed, and every verify-*.sql passed.");
