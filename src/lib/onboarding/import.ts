import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ghlRequest } from "@/lib/ghl/client";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { GhlDb } from "@/lib/ghl/tokens";
import { automationAllowed } from "@/lib/inbound/holds";
import {
  aiEligible,
  basicCaseFileSummary,
  displayLabel,
  inWindow,
  parseCrmContact,
  problemsFor,
  type CrmContact,
} from "@/lib/onboarding/import-plan";

/**
 * Brings a workspace's existing leads in from its CRM, in the background.
 *
 * - It works a page of 100 contacts at a time and saves where it got to after
 *   every page, so it can pause, resume, survive a connection that fails part
 *   way, and handle a CRM with many thousands of contacts.
 * - It shares the workspace's CRM rate limit with everything else, so it never
 *   crowds out live work.
 * - Running it again never creates duplicates: a CRM contact maps to one lead.
 * - Every imported lead is marked historic. The database refuses clocks,
 *   alerts, drafts, approvals and lead notices for it until a person works it
 *   or the lead gets in touch again.
 * - Each new lead gets a basic case file from its CRM fields (no AI). Open
 *   leads active recently are queued for Scribe's full case file, paced
 *   separately (case-files.ts).
 */

type Db = SupabaseClient;

const TICK_MS = 40_000;
const PAGE_SIZE = 100;
const STALE_CLAIM_MS = 5 * 60_000;

type Run = {
  id: string;
  org_id: string;
  status: string;
  window_start: string;
  progress: { page?: number } | null;
  found: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  do_not_contact: number;
  basic_case_files: number;
  ai_eligible: number;
  skip_reasons: Record<string, number> | null;
  attempts: number;
  started_at: string | null;
};

async function consumeRate(db: Db, orgId: string): Promise<boolean> {
  const { data, error } = await db.rpc("try_consume_ghl_rate", { p_org_id: orgId });
  return !error && data === true;
}

async function claimRuns(db: Db, max: number): Promise<Run[]> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data } = await db
    .from("onboarding_import_runs")
    .select("*")
    .in("status", ["queued", "running"])
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order("updated_at", { ascending: true })
    .limit(max);
  const claimed: Run[] = [];
  for (const row of (data ?? []) as Array<Run & { claimed_at: string | null }>) {
    const now = new Date().toISOString();
    let query = db
      .from("onboarding_import_runs")
      .update({ claimed_at: now, status: "running", started_at: row.started_at ?? now, updated_at: now })
      .eq("id", row.id)
      .in("status", ["queued", "running"]);
    query = row.claimed_at ? query.eq("claimed_at", row.claimed_at) : query.is("claimed_at", null);
    const { data: won } = await query.select("*").maybeSingle();
    if (won) claimed.push(won as Run);
  }
  return claimed;
}

async function settings(db: Db, orgId: string): Promise<{ activeDays: number }> {
  const { data } = await db.from("staff_support_settings").select("onboarding_ai_active_days").eq("id", true).maybeSingle();
  void orgId;
  return { activeDays: Number((data as { onboarding_ai_active_days?: number } | null)?.onboarding_ai_active_days ?? 30) };
}

async function fetchPage(db: Db, orgId: string, locationId: string, page: number): Promise<{ ok: boolean; contacts: unknown[]; status: number }> {
  const result = await ghlRequest<{ contacts?: unknown[] }>(db as unknown as GhlDb, orgId, "/contacts/search", {
    method: "POST",
    body: JSON.stringify({ locationId, page, pageLimit: PAGE_SIZE }),
  });
  return { ok: result.ok, status: result.status, contacts: Array.isArray(result.json?.contacts) ? result.json.contacts : [] };
}

type PageOutcome = {
  found: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  doNotContact: number;
  basic: number;
  aiEligible: number;
  skipReasons: Record<string, number>;
};

/** One page of contacts into leads. Safe to run twice on the same page. */
export async function importContacts(
  db: Db,
  args: { orgId: string; runId: string; windowStart: string; activeDays: number; contacts: unknown[]; now?: number }
): Promise<PageOutcome> {
  const out: PageOutcome = { found: 0, imported: 0, updated: 0, skipped: 0, failed: 0, doNotContact: 0, basic: 0, aiEligible: 0, skipReasons: {} };
  const skip = (reason: string) => {
    out.skipped += 1;
    out.skipReasons[reason] = (out.skipReasons[reason] ?? 0) + 1;
  };

  const parsed: CrmContact[] = [];
  for (const raw of args.contacts) {
    const contact = parseCrmContact(raw);
    if (!contact) {
      skip("unreadable");
      continue;
    }
    if (!inWindow(contact.createdAt, args.windowStart)) {
      skip("outside_window");
      continue;
    }
    parsed.push(contact);
  }
  out.found = parsed.length;
  if (parsed.length === 0) return out;

  const ids = parsed.map((contact) => contact.id);
  const { data: existing } = await db.from("leads").select("id, ghl_contact_id").eq("org_id", args.orgId).in("ghl_contact_id", ids);
  const existingByContact = new Map(((existing ?? []) as Array<{ id: string; ghl_contact_id: string }>).map((row) => [row.ghl_contact_id, row.id]));
  const { data: marks } = existingByContact.size
    ? await db.from("lead_import_marks").select("lead_id").in("lead_id", [...existingByContact.values()])
    : { data: [] };
  const historic = new Set(((marks ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id));

  const fresh = parsed.filter((contact) => !existingByContact.has(contact.id));
  for (const contact of parsed) {
    const leadId = existingByContact.get(contact.id);
    if (!leadId) continue;
    if (historic.has(leadId)) out.updated += 1;
    else skip("already_in_vistrial");
  }

  // Possible duplicates: the same phone or email on another lead in this workspace.
  const phones = fresh.map((contact) => contact.phone).filter((value): value is string => Boolean(value));
  const emails = fresh.map((contact) => contact.email).filter((value): value is string => Boolean(value));
  const [{ data: phoneHits }, { data: emailHits }] = await Promise.all([
    phones.length ? db.from("leads").select("phone").eq("org_id", args.orgId).in("phone", phones) : Promise.resolve({ data: [] }),
    emails.length ? db.from("leads").select("email").eq("org_id", args.orgId).in("email", emails) : Promise.resolve({ data: [] }),
  ]);
  const seenPhones = new Set(((phoneHits ?? []) as Array<{ phone: string | null }>).map((row) => row.phone));
  const seenEmails = new Set(((emailHits ?? []) as Array<{ email: string | null }>).map((row) => row.email?.toLowerCase()));

  if (fresh.length) {
    const now = args.now ?? Date.now();
    const rows = fresh.map((contact) => {
      const problems = problemsFor(contact);
      if ((contact.phone && seenPhones.has(contact.phone)) || (contact.email && seenEmails.has(contact.email))) problems.push("possible_duplicate");
      const created = contact.createdAt && !Number.isNaN(Date.parse(contact.createdAt)) ? contact.createdAt : null;
      const active = contact.lastActivityAt && !Number.isNaN(Date.parse(contact.lastActivityAt)) ? contact.lastActivityAt : null;
      return {
        ghl_contact_id: contact.id,
        first_name: contact.firstName,
        last_name: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        source: contact.source,
        timezone: contact.timezone,
        opted_in_at: created,
        do_not_contact: contact.doNotContact,
        crm_created_at: created,
        crm_last_activity_at: active,
        ai_eligible: aiEligible(contact, args.activeDays, now),
        summary: basicCaseFileSummary(contact),
        label: displayLabel(contact),
        problems,
      };
    });
    // Leads, their historic marks, basic case files, and problems are written
    // in one transaction, so no job ever sees an imported lead unmarked.
    const { data: inserted, error } = await db.rpc("onboarding_import_write", { p_org_id: args.orgId, p_run_id: args.runId, p_rows: rows });
    if (error) {
      out.failed += fresh.length;
      ghlError("onboarding.import.insert_failed", { orgId: args.orgId, error: error.message });
      return out;
    }
    const insertedRows = (inserted ?? []) as Array<{ lead_id: string; ghl_contact_id: string }>;
    const byContact = new Map(fresh.map((contact) => [contact.id, contact]));
    for (const row of insertedRows) {
      const contact = byContact.get(row.ghl_contact_id);
      if (!contact) continue;
      if (contact.doNotContact) out.doNotContact += 1;
      if (aiEligible(contact, args.activeDays, now)) out.aiEligible += 1;
    }
    out.imported += insertedRows.length;
    out.basic += insertedRows.length;
    // Contacts that arrived from the live CRM feed between our read and the write.
    const raced = fresh.length - insertedRows.length;
    for (let i = 0; i < raced; i += 1) skip("already_in_vistrial");
  }
  return out;
}

function add(run: Run, page: PageOutcome): Partial<Run> {
  const reasons = { ...(run.skip_reasons ?? {}) };
  for (const [key, count] of Object.entries(page.skipReasons)) reasons[key] = (reasons[key] ?? 0) + count;
  return {
    found: run.found + page.found,
    imported: run.imported + page.imported,
    updated: run.updated + page.updated,
    skipped: run.skipped + page.skipped,
    failed: run.failed + page.failed,
    do_not_contact: run.do_not_contact + page.doNotContact,
    basic_case_files: run.basic_case_files + page.basic,
    ai_eligible: run.ai_eligible + page.aiEligible,
    skip_reasons: reasons,
  };
}

async function advanceRun(db: Db, run: Run, deadline: number): Promise<"done" | "more" | "failed" | "held"> {
  if (!(await automationAllowed(db as never, run.org_id))) {
    await db.from("onboarding_import_runs").update({ claimed_at: null, updated_at: new Date().toISOString() }).eq("id", run.id);
    return "held";
  }
  const { data: connection } = await db.from("ghl_connections").select("location_id, status").eq("org_id", run.org_id).maybeSingle();
  const conn = connection as { location_id: string | null; status: string } | null;
  if (!conn?.location_id || conn.status !== "active") {
    await db
      .from("onboarding_import_runs")
      .update({
        status: "failed",
        last_error: "The CRM connection stopped working. Reconnect it and the import carries on from where it stopped.",
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return "failed";
  }
  const { activeDays } = await settings(db, run.org_id);
  let current = run;
  let page = Math.max(1, Number(run.progress?.page ?? 1));

  while (Date.now() < deadline) {
    const { data: status } = await db.from("onboarding_import_runs").select("status").eq("id", run.id).maybeSingle();
    if ((status as { status?: string } | null)?.status !== "running") return "held";
    if (!(await consumeRate(db, run.org_id))) break;

    const fetched = await fetchPage(db, run.org_id, conn.location_id, page);
    if (!fetched.ok) {
      const attempts = current.attempts + 1;
      const failed = attempts >= 5 || fetched.status === 401 || fetched.status === 0;
      await db
        .from("onboarding_import_runs")
        .update({
          attempts,
          status: failed ? "failed" : "running",
          last_error: failed ? "Your CRM stopped answering. The import carries on from where it stopped once the connection works." : null,
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return failed ? "failed" : "more";
    }

    const outcome = await importContacts(db, {
      orgId: run.org_id,
      runId: run.id,
      windowStart: run.window_start,
      activeDays,
      contacts: fetched.contacts,
    });
    const totals = add(current, outcome);
    current = { ...current, ...totals };
    page += 1;
    const finished = fetched.contacts.length < PAGE_SIZE;
    await db
      .from("onboarding_import_runs")
      .update({
        ...totals,
        progress: { page },
        attempts: 0,
        ...(finished ? { status: "done", finished_at: new Date().toISOString(), claimed_at: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running");
    if (finished) {
      ghlLog("onboarding.import.done", { orgId: run.org_id, imported: current.imported });
      await db.rpc("ws_log", {
        p_org_id: run.org_id,
        p_action: "onboarding.import_done",
        p_target_table: "onboarding_import_runs",
        p_target_id: run.id,
        p_detail: { imported: current.imported, skipped: current.skipped, failed: current.failed },
      });
      return "done";
    }
  }
  await db.from("onboarding_import_runs").update({ claimed_at: null, updated_at: new Date().toISOString() }).eq("id", run.id);
  return "more";
}

export async function runImports(db: Db, budgetMs = TICK_MS): Promise<{ runs: number; done: number; failed: number }> {
  const deadline = Date.now() + budgetMs;
  const runs = await claimRuns(db, 3);
  let done = 0;
  let failed = 0;
  const touched = new Set<string>();
  for (const run of runs) {
    if (Date.now() >= deadline) {
      await db.from("onboarding_import_runs").update({ claimed_at: null }).eq("id", run.id);
      continue;
    }
    const share = Math.max(5_000, Math.floor((deadline - Date.now()) / Math.max(1, runs.length)));
    const result = await advanceRun(db, run, Math.min(deadline, Date.now() + share)).catch((error: unknown) => {
      ghlError("onboarding.import.failed", { orgId: run.org_id, error: error instanceof Error ? error.message : "unknown" });
      return "failed" as const;
    });
    if (result === "done") done += 1;
    if (result === "failed") failed += 1;
    touched.add(run.org_id);
  }
  for (const orgId of touched) await db.rpc("onboarding_refresh", { p_org_id: orgId });
  return { runs: runs.length, done, failed };
}
