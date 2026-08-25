#!/usr/bin/env node
/**
 * Fail the build if a secret-shaped value is in the client bundle.
 * Inspects `.next/static` only — server chunks may contain env names as
 * strings; the defect is shipping the value to the browser.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), ".next", "static");

const FORBIDDEN = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /SUPABASE_SECRET_KEY/,
  /sb_secret_/,
  /ANTHROPIC_API_KEY/,
  /GHL_CLIENT_SECRET/,
  /GHL_TOKEN_ENCRYPTION_KEY/,
  /TWILIO_AUTH_TOKEN/,
  /TWILIO_ACCOUNT_SID/,
  /VAPID_PRIVATE_KEY/,
  /CRON_SECRET/,
  /RESEND_API_KEY/,
  /RESEND_WEBHOOK_SECRET/,
  /sk-ant-/,
];

function walk(dir, files = []) {
  if (!statSync(dir, { throwIfNoEntry: false })) return files;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (/\.(js|json|css|map|html)$/.test(entry)) files.push(path);
  }
  return files;
}

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error("assert-no-secrets-in-client: .next/static is missing. Run next build first.");
  process.exit  (1);
}

const files = walk(ROOT);
const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      hits.push(`${file}: ${pattern}`);
    }
  }
}

if (hits.length) {
  console.error("Secret-shaped identifiers found in the client bundle:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log(`assert-no-secrets-in-client: scanned ${files.length} files under .next/static, none matched.`);
