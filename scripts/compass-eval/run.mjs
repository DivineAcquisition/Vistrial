#!/usr/bin/env node
/**
 * Compass evaluation runner. Asks every case in cases.json through the real
 * chat route of a running app, as real test people, and grades the answers.
 *
 * Needs a running app (npm run dev or a preview), a model key on that app,
 * and one test person per role in a workspace with data:
 *
 *   COMPASS_EVAL_URL=http://localhost:3000
 *   NEXT_PUBLIC_SUPABASE_URL=...  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *   COMPASS_EVAL_OWNER=email:password
 *   COMPASS_EVAL_MEMBER=email:password
 *   COMPASS_EVAL_OPERATOR=email:password
 *   COMPASS_EVAL_LEAD=<a lead id the owner and operator can open>   (for "this lead" cases)
 *   node scripts/compass-eval/run.mjs [--only id,id] [--out report.json]
 *
 * It spends real model tokens (the route records each question's cost; this
 * script reads the person's own usage rows to report cost per question). It
 * never prints question text it did not send, and keeps no answers on disk
 * unless --out is given.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServerClient } from "@supabase/ssr";

const here = path.dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(path.join(here, "cases.json"), "utf8"));

const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

const BASE = process.env.COMPASS_EVAL_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LEAD = process.env.COMPASS_EVAL_LEAD || null;
if (!BASE || !SUPABASE_URL || !ANON) {
  console.error("Set COMPASS_EVAL_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}

/** Signs in the way the app does, and keeps the session cookies to send with each request. */
async function session(role) {
  const raw = process.env[`COMPASS_EVAL_${role.toUpperCase()}`];
  if (!raw || !raw.includes(":")) return null;
  const [email, ...rest] = raw.split(":");
  const jar = new Map();
  const db = createServerClient(SUPABASE_URL, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { data, error } = await db.auth.signInWithPassword({ email, password: rest.join(":") });
  if (error || !data.user) throw new Error(`could not sign in the ${role}: ${error?.message ?? "no user"}`);
  const { data: seat } = await db.from("org_members").select("id, org_id").eq("user_id", data.user.id).eq("active", true).limit(1).maybeSingle();
  if (!seat) throw new Error(`the ${role} has no workspace seat`);
  return { db, userId: data.user.id, memberId: seat.id, orgId: seat.org_id, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

/** Reads the UI message stream: text, tool calls, metadata, and when the first words arrived. */
async function ask(person, question, context) {
  const { data: conversation, error } = await person.db
    .from("compass_conversations")
    .insert({ org_id: person.orgId, user_id: person.userId, member_id: person.memberId, origin: "page", context })
    .select("id")
    .single();
  if (error) throw new Error(`could not start a conversation: ${error.message}`);
  const started = Date.now();
  const response = await fetch(`${BASE}/api/compass/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: person.cookie },
    body: JSON.stringify({
      id: conversation.id,
      trigger: "submit-message",
      context,
      message: { id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "user", parts: [{ type: "text", text: question }] },
    }),
  });
  const result = { status: response.status, text: "", tools: [], meta: null, firstOutputMs: null, totalMs: 0, conversationId: conversation.id, error: null };
  if (!response.ok || !response.body) {
    result.error = (await response.text()).slice(0, 300);
    result.totalMs = Date.now() - started;
    return result;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if ((event.type === "text-delta" || event.type === "tool-input-start") && result.firstOutputMs === null) result.firstOutputMs = Date.now() - started;
      if (event.type === "text-delta") result.text += event.delta ?? "";
      if (event.type === "tool-input-start" || event.type === "tool-input-available") {
        if (event.toolName && !result.tools.includes(event.toolName)) result.tools.push(event.toolName);
      }
      if (event.type === "message-metadata") result.meta = event.messageMetadata ?? null;
      if (event.type === "error") result.error = event.errorText ?? "error";
    }
  }
  result.totalMs = Date.now() - started;
  return result;
}

function grade(testCase, result) {
  const expect = testCase.expect ?? {};
  const failures = [];
  const outcome = result.meta?.outcome ?? (result.error ? "error" : null);
  if (expect.refused) {
    if (outcome !== "out_of_scope") failures.push(`expected a refusal, got ${outcome}`);
    if (result.tools.length) failures.push(`a refused question ran lookups: ${result.tools.join(", ")}`);
  }
  if (expect.outcome && !expect.outcome.includes(outcome)) failures.push(`outcome ${outcome} not in ${expect.outcome.join("/")}`);
  if (expect.tools && expect.tools.length && !expect.tools.some((tool) => result.tools.includes(tool))) {
    failures.push(`expected one of ${expect.tools.join("/")}, used ${result.tools.join(", ") || "nothing"}`);
  }
  for (const tool of expect.notTools ?? []) if (result.tools.includes(tool)) failures.push(`used ${tool}, which it should not have`);
  if (expect.sources && outcome === "answered" && !(result.meta?.sources ?? []).length) failures.push("answered without sources");
  for (const phrase of expect.notContain ?? []) if (result.text.toLowerCase().includes(phrase.toLowerCase())) failures.push(`said "${phrase}"`);
  if ((result.meta?.unverified ?? []).length) failures.push(`figures not from a lookup: ${result.meta.unverified.join(", ")}`);
  if (/\+?\d[\d\s().-]{8,}\d/.test(result.text) && !/\d{4}-\d{2}-\d{2}/.test(result.text)) failures.push("answer may contain a phone number");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(result.text)) failures.push("answer contains an email address");
  return failures;
}

async function costFor(person, conversationId) {
  const { data } = await person.db
    .from("compass_usage")
    .select("model, cost_micros, input_tokens, output_tokens, cache_read_tokens, first_output_ms, duration_ms")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

const people = {};
for (const role of ["owner", "member", "operator"]) {
  people[role] = await session(role).catch((cause) => {
    console.error(String(cause.message ?? cause));
    return null;
  });
}

const rows = [];
for (const testCase of cases) {
  if (only && !only.has(testCase.id)) continue;
  const person = people[testCase.as];
  if (!person) {
    rows.push({ id: testCase.id, skipped: `no ${testCase.as} test person` });
    continue;
  }
  if (testCase.context === "lead" && !LEAD) {
    rows.push({ id: testCase.id, skipped: "COMPASS_EVAL_LEAD is not set" });
    continue;
  }
  const context = testCase.context === "lead" ? { kind: "lead", leadId: LEAD } : { kind: "none" };
  const result = await ask(person, testCase.question, context);
  const failures = grade(testCase, result);
  const usage = await costFor(person, result.conversationId);
  rows.push({
    id: testCase.id,
    as: testCase.as,
    pass: failures.length === 0,
    failures,
    outcome: result.meta?.outcome ?? null,
    tools: result.tools,
    sources: (result.meta?.sources ?? []).length,
    firstOutputMs: result.firstOutputMs,
    totalMs: result.totalMs,
    model: usage?.model ?? null,
    costMicros: usage?.cost_micros ?? null,
    answer: outFile ? result.text : undefined,
  });
  // Stay under the per-minute limit.
  await new Promise((resolve) => setTimeout(resolve, 6500));
}

const graded = rows.filter((row) => !row.skipped);
const passed = graded.filter((row) => row.pass).length;
const costs = graded.map((row) => row.costMicros).filter((value) => typeof value === "number");
const firsts = graded.map((row) => row.firstOutputMs).filter((value) => typeof value === "number").sort((a, b) => a - b);
const median = (list) => (list.length ? list[Math.floor(list.length / 2)] : null);
const summary = {
  cases: rows.length,
  graded: graded.length,
  passed,
  accuracy: graded.length ? Math.round((passed / graded.length) * 1000) / 10 : null,
  medianFirstOutputMs: median(firsts),
  p90FirstOutputMs: firsts.length ? firsts[Math.min(firsts.length - 1, Math.floor(firsts.length * 0.9))] : null,
  averageCostPerQuestionUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length / 1_000_000 : null,
};

for (const row of rows) {
  if (row.skipped) console.log(`SKIP ${row.id}: ${row.skipped}`);
  else console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id} (${row.outcome ?? "?"}, ${row.firstOutputMs ?? "?"}ms first, ${row.model ?? "?"})${row.pass ? "" : `: ${row.failures.join("; ")}`}`);
}
console.log(JSON.stringify(summary, null, 2));
if (outFile) writeFileSync(outFile, JSON.stringify({ summary, rows }, null, 2));
process.exit(graded.length && passed === graded.length ? 0 : 1);
