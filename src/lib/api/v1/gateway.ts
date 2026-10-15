import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeRateLimit, rateLimitKey, requestIp } from "@/lib/ops/rate-limit";
import { emitWebhookEvent } from "@/lib/webhooks/deliver";
import { API_LIMITS, isApiScope, READ_SCOPES, WRITE_SCOPES, type ApiScope } from "@/lib/api/v1/limits";
import type { SupabaseClient } from "@supabase/supabase-js";

type KeyRow = {
  id: string;
  org_id: string;
  name: string;
  mode: "live" | "test";
  scopes: string[];
  allow_ips: string[];
  expires_at: string | null;
  revoked_at: string | null;
};

type Ctx = {
  db: SupabaseClient;
  key: KeyRow;
  requestId: string;
  practice: boolean;
};

const LEAD_WRITE = z
  .object({
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    email: z.string().email().max(200).optional(),
    phone: z.string().max(40).optional(),
    source: z.string().max(120).optional(),
    status: z.enum(["new", "working", "call_booked", "no_show", "follow_up", "objection_hold", "ghost", "closed_won", "closed_lost"]).optional(),
    offer_name: z.string().max(120).optional(),
    historic: z.boolean().optional(),
    external_id: z.string().max(120).optional(),
  })
  .strict();

function db(): SupabaseClient {
  return getSupabaseAdmin() as unknown as SupabaseClient;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function apiError(status: number, code: string, message: string, requestId: string, extra?: Record<string, string>) {
  const headers = new Headers({ "content-type": "application/json", "x-request-id": requestId, "cache-control": "no-store" });
  if (extra) for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(JSON.stringify({ error: { code, message, request_id: requestId } }), { status, headers });
}

function ok(body: unknown, requestId: string, rate: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": requestId, "cache-control": "no-store", ...rate },
  });
}

function rateHeaders(limit: number, remaining: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(remaining, 0)),
    "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 60),
  };
}

export async function handleApi(request: Request, path: string[]): Promise<Response> {
  const requestId = randomUUID();
  const client = db();
  const ip = requestIp(request);
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return apiError(401, "unauthorized", "Send the API key in the Authorization header.", requestId);

  const failures = await consumeRateLimit(client, {
    key: rateLimitKey(["api-fail", ip]),
    limit: 30,
    windowSeconds: 900,
  });
  if (!failures.allowed) {
    return apiError(429, "slow_down", "Too many failed attempts from this address. Wait and try again.", requestId, {
      "Retry-After": "900",
    });
  }

  const { data: key } = await client.from("api_keys").select("*").eq("secret_hash", hashSecret(token)).maybeSingle();
  const row = key as KeyRow | null;
  if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) {
    return apiError(401, "unauthorized", "That API key is not valid.", requestId);
  }
  if (row.allow_ips.length > 0 && !row.allow_ips.includes(ip)) {
    return apiError(403, "forbidden", "This key cannot be used from this address.", requestId);
  }

  const perKey = await consumeRateLimit(client, {
    key: rateLimitKey(["api-key", row.id]),
    limit: API_LIMITS.perKeyPerMinute,
    windowSeconds: 60,
  });
  const perOrg = await consumeRateLimit(client, {
    key: rateLimitKey(["api-org", row.org_id]),
    limit: API_LIMITS.perWorkspacePerMinute,
    windowSeconds: 60,
  });
  const headers = rateHeaders(API_LIMITS.perKeyPerMinute, Math.min(perKey.remaining, perOrg.remaining));
  if (!perKey.allowed || !perOrg.allowed) {
    return apiError(429, "slow_down", "Slow down. This key has used its requests for the minute.", requestId, {
      ...headers,
      "Retry-After": "60",
    });
  }

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const { count } = await client
    .from("api_request_log")
    .select("id", { count: "exact", head: true })
    .eq("org_id", row.org_id)
    .gte("created_at", day.toISOString());
  if ((count ?? 0) >= API_LIMITS.dailyRequests) {
    return apiError(429, "quota", "This workspace has used its requests for today. The limit resets tomorrow.", requestId, headers);
  }

  const { data: access } = await client.rpc("billing_feature", { p_org_id: row.org_id, p_key: "api_access" });
  if (access !== true) {
    return apiError(403, "not_included", "API access is not on for this workspace. An owner can ask the Vistrial team to turn it on.", requestId, headers);
  }

  const method = request.method.toUpperCase();
  const writing = method !== "GET" && method !== "HEAD";
  if (writing) {
    const { data: blocked } = await client.rpc("billing_blocks_cost", { p_org_id: row.org_id });
    if (blocked === true) {
      return apiError(403, "paused", "Writes are paused while billing is restricted. Reading and export still work.", requestId, headers);
    }
  }

  const ctx: Ctx = { db: client, key: row, requestId, practice: row.mode === "test" };
  let response: Response;
  try {
    response = await route(ctx, request, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request could not be completed.";
    response = apiError(400, "invalid", message, requestId, headers);
  }
  const withRate = new Response(response.body, { status: response.status, headers: response.headers });
  for (const [name, value] of Object.entries(headers)) withRate.headers.set(name, value);
  await client.from("api_request_log").insert({
    org_id: row.org_id,
    key_id: row.id,
    key_name: row.name,
    method,
    path: `/${path.join("/")}`,
    status: withRate.status,
    request_id: requestId,
  });
  await client.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return withRate;
}

async function route(ctx: Ctx, request: Request, path: string[]): Promise<Response> {
  const [resource, id, child] = path;
  if (!resource) return apiError(404, "not_found", "That path does not exist.", ctx.requestId);
  if (request.method === "GET" && resource === "metrics") return readMetrics(ctx, request);
  if (request.method === "GET" && resource === "leads" && !id) return listLeads(ctx, request);
  if (request.method === "GET" && resource === "leads" && id && !child) return getLead(ctx, id);
  if (request.method === "GET" && resource === "leads" && id && child) return listChild(ctx, id, child);
  if (request.method === "GET" && ["bookings", "outcomes", "tasks"].includes(resource)) return listTop(ctx, resource, request);
  if (request.method === "POST" && resource === "leads" && !id) return writeLead(ctx, request, null);
  if (request.method === "POST" && resource === "leads" && id) return writeLead(ctx, request, id);
  if (request.method === "POST" && ["touches", "notes", "bookings", "outcomes", "tasks", "opt-outs"].includes(resource ?? "")) {
    return writeOther(ctx, request, resource!);
  }
  return apiError(404, "not_found", "That path does not exist.", ctx.requestId);
}

function requireScope(ctx: Ctx, scope: ApiScope | undefined) {
  if (!scope || !ctx.key.scopes.includes(scope)) {
    throw new Error("This key does not include that permission.");
  }
}

async function listLeads(ctx: Ctx, request: Request): Promise<Response> {
  requireScope(ctx, "leads:read");
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
  let query = ctx.db
    .from("leads")
    .select("id, first_name, last_name, email, phone, source, status, offer_name, opted_in_at, created_at, is_test")
    .eq("org_id", ctx.key.org_id)
    .eq("is_test", ctx.practice)
    .order("created_at", { ascending: false })
    .limit(limit);
  const source = url.searchParams.get("source");
  if (source) query = query.eq("source", source);
  const { data, error } = await query;
  if (error) throw new Error("The leads could not be listed.");
  return ok({ data: data ?? [], next: null }, ctx.requestId, {});
}

async function getLead(ctx: Ctx, id: string): Promise<Response> {
  requireScope(ctx, "leads:read");
  const { data } = await ctx.db
    .from("leads")
    .select("id, first_name, last_name, email, phone, source, status, offer_name, opted_in_at, created_at, is_test, do_not_contact")
    .eq("org_id", ctx.key.org_id)
    .eq("id", id)
    .eq("is_test", ctx.practice)
    .maybeSingle();
  if (!data) return apiError(404, "not_found", "No lead with that id was found.", ctx.requestId);
  const { data: fields } = await ctx.db
    .from("case_file_fields")
    .select("field_key, label, value, state, source, locked")
    .eq("org_id", ctx.key.org_id)
    .eq("lead_id", id);
  const { data: provenance } = await ctx.db
    .from("record_provenance")
    .select("source_label, recorded_at, historic")
    .eq("org_id", ctx.key.org_id)
    .eq("subject_id", id)
    .order("recorded_at", { ascending: false })
    .limit(10);
  return ok({ data: { ...(data as object), case_file: fields ?? [], provenance: provenance ?? [] } }, ctx.requestId, {});
}

async function listChild(ctx: Ctx, leadId: string, child: string): Promise<Response> {
  const scope = READ_SCOPES[child];
  requireScope(ctx, scope);
  const lead = await ctx.db.from("leads").select("id").eq("org_id", ctx.key.org_id).eq("id", leadId).eq("is_test", ctx.practice).maybeSingle();
  if (!lead.data) return apiError(404, "not_found", "No lead with that id was found.", ctx.requestId);
  if (child === "touches") {
    const { data } = await ctx.db
      .from("touches")
      .select("id, type, channel, direction, occurred_at, outcome, actor_member_id")
      .eq("org_id", ctx.key.org_id)
      .eq("lead_id", leadId);
    return ok({ data: data ?? [] }, ctx.requestId, {});
  }
  if (child === "calls") {
    const { data } = await ctx.db
      .from("calls")
      .select("id, scheduled_at, started_at, ended_at, outcome, created_at")
      .eq("org_id", ctx.key.org_id)
      .eq("lead_id", leadId);
    return ok({ data: data ?? [] }, ctx.requestId, {});
  }
  if (child === "notes") {
    const { data } = await ctx.db
      .from("lead_notes")
      .select("id, body, visibility, created_at, source_label")
      .eq("org_id", ctx.key.org_id)
      .eq("lead_id", leadId)
      .eq("visibility", "shared");
    return ok({ data: data ?? [] }, ctx.requestId, {});
  }
  return apiError(404, "not_found", "That path does not exist.", ctx.requestId);
}

async function listTop(ctx: Ctx, resource: string, request: Request): Promise<Response> {
  requireScope(ctx, READ_SCOPES[resource]);
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
  if (resource === "tasks") {
    const { data } = await ctx.db
      .from("next_actions")
      .select("id, lead_id, action_text, due_at, completed_at, created_at")
      .eq("org_id", ctx.key.org_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    return ok({ data: data ?? [] }, ctx.requestId, {});
  }
  if (resource === "outcomes") {
    const { data } = await ctx.db
      .from("revenue_log")
      .select("id, lead_id, amount_cents, currency, kind, payment_type, occurred_at")
      .eq("org_id", ctx.key.org_id)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    return ok({ data: data ?? [] }, ctx.requestId, {});
  }
  const { data } = await ctx.db
    .from("calls")
    .select("id, lead_id, scheduled_at, outcome, created_at")
    .eq("org_id", ctx.key.org_id)
    .not("scheduled_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ok({ data: data ?? [] }, ctx.requestId, {});
}

async function readMetrics(ctx: Ctx, request: Request): Promise<Response> {
  requireScope(ctx, "metrics:read");
  const url = new URL(request.url);
  const metric = url.searchParams.get("metric");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!metric || !from || !to || !isApiScope("metrics:read")) {
    throw new Error("Pass metric, from, and to.");
  }
  const { data, error } = await ctx.db.rpc("portal_metric_summary", {
    p_org_id: ctx.key.org_id,
    p_metrics: [metric],
    p_from: from,
    p_to: to,
    p_prev_from: url.searchParams.get("previous_from"),
    p_prev_to: url.searchParams.get("previous_to"),
    p_filters: {},
  });
  if (error) throw new Error("That metric could not be read.");
  return ok({ data }, ctx.requestId, {});
}

async function idempotent(ctx: Ctx, request: Request, run: (body: unknown) => Promise<Record<string, unknown>>): Promise<Response> {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 200) throw new Error("Send an Idempotency-Key header so a retry does not create a second record.");
  const raw = await request.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("The body has to be JSON.");
  }
  const requestHash = createHash("sha256").update(raw).digest("hex");
  const { data: existing } = await ctx.db
    .from("api_idempotency")
    .select("request_hash, status, response")
    .eq("key_id", ctx.key.id)
    .eq("idempotency_key", key)
    .maybeSingle();
  const prior = existing as { request_hash: string; status: number; response: Record<string, unknown> } | null;
  if (prior) {
    if (prior.request_hash !== requestHash) {
      return apiError(409, "conflict", "That idempotency key was already used for a different request.", ctx.requestId);
    }
    return ok(prior.response, ctx.requestId, {});
  }
  const response = await run(body);
  await ctx.db.from("api_idempotency").insert({
    org_id: ctx.key.org_id,
    key_id: ctx.key.id,
    idempotency_key: key,
    request_hash: requestHash,
    status: 200,
    response,
  });
  return ok(response, ctx.requestId, {});
}

async function writeLead(ctx: Ctx, request: Request, id: string | null): Promise<Response> {
  requireScope(ctx, WRITE_SCOPES.leads);
  return idempotent(ctx, request, async (raw) => {
    const parsed = LEAD_WRITE.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "The lead was not accepted.");
    const input = parsed.data;
    const sourceLabel = `API: ${ctx.key.name}`;
    if (id) {
      const { data: current } = await ctx.db
        .from("leads")
        .select("id, email, phone, source, status")
        .eq("org_id", ctx.key.org_id)
        .eq("id", id)
        .eq("is_test", ctx.practice)
        .maybeSingle();
      if (!current) return { error: { code: "not_found", message: "No lead with that id was found." } };
      const patch: Record<string, unknown> = {};
      const conflicts: string[] = [];
      for (const field of ["email", "phone", "source", "status"] as const) {
        if (input[field] === undefined) continue;
        const existing = (current as Record<string, unknown>)[field];
        if (existing && existing !== input[field]) conflicts.push(field);
        else patch[field] = input[field];
      }
      if (input.first_name) patch.first_name = input.first_name;
      if (input.last_name) patch.last_name = input.last_name;
      if (input.offer_name) patch.offer_name = input.offer_name;
      if (Object.keys(patch).length) {
        await ctx.db.from("leads").update(patch).eq("id", id).eq("org_id", ctx.key.org_id);
      }
      if (conflicts.length) {
        await ctx.db.from("inbound_event_holds").insert({
          source: "api",
          event_type: "lead.update",
          external_ref: `api:${ctx.key.id}:${id}:${conflicts.join(",")}`,
          reason: "unmatched",
          org_id: ctx.key.org_id,
          payload: { lead_id: id, fields: conflicts, source: sourceLabel },
        });
      }
      await provenance(ctx, "leads", id, sourceLabel, Boolean(input.historic));
      if (!ctx.practice && !input.historic) {
        await emitWebhookEvent(ctx.db, {
          orgId: ctx.key.org_id,
          type: "lead.updated",
          recordIds: [id],
          changedFields: Object.keys(patch),
          sourceLabel,
        });
      }
      return { id, updated: Object.keys(patch), review: conflicts };
    }
    const { data: created, error } = await ctx.db
      .from("leads")
      .insert({
        org_id: ctx.key.org_id,
        first_name: input.first_name ?? null,
        last_name: input.last_name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? "api",
        status: input.status ?? "new",
        offer_name: input.offer_name ?? null,
        is_test: ctx.practice,
        opted_in_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (error || !created) throw new Error("The lead could not be saved.");
    const leadId = (created as { id: string }).id;
    if (input.historic && !ctx.practice) {
      await ctx.db.from("lead_import_marks").insert({ lead_id: leadId, org_id: ctx.key.org_id, ai_state: "none" });
    }
    await provenance(ctx, "leads", leadId, sourceLabel, Boolean(input.historic));
    if (!ctx.practice && !input.historic) {
      await emitWebhookEvent(ctx.db, { orgId: ctx.key.org_id, type: "lead.created", recordIds: [leadId], sourceLabel });
    }
    return { id: leadId, review: [] };
  });
}

async function writeOther(ctx: Ctx, request: Request, resource: string): Promise<Response> {
  requireScope(ctx, WRITE_SCOPES[resource]);
  return idempotent(ctx, request, async (raw) => {
    const body = z.record(z.string(), z.unknown()).parse(raw);
    const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
    const lead = await ctx.db.from("leads").select("id, is_test").eq("org_id", ctx.key.org_id).eq("id", leadId).eq("is_test", ctx.practice).maybeSingle();
    if (!lead.data) return { error: { code: "not_found", message: "No lead with that id was found." } };
    const historic = body.historic === true;
    const sourceLabel = `API: ${ctx.key.name}`;
    if (resource === "touches") {
      const { data, error } = await ctx.db
        .from("touches")
        .insert({
          org_id: ctx.key.org_id,
          lead_id: leadId,
          type: "system",
          channel: body.channel === "email" ? "email" : body.channel === "call" ? "call" : "other",
          direction: body.direction === "inbound" ? "inbound" : "outbound",
          occurred_at: typeof body.occurred_at === "string" ? body.occurred_at : new Date().toISOString(),
          summary: typeof body.summary === "string" ? body.summary.slice(0, 240) : null,
        })
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("The touch could not be saved.");
      await afterWrite(ctx, "touch.logged", (data as { id: string }).id, leadId, sourceLabel, historic);
      return { id: (data as { id: string }).id };
    }
    if (resource === "notes") {
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!text) throw new Error("Write the note in body.");
      const { data, error } = await ctx.db
        .from("lead_notes")
        .insert({ org_id: ctx.key.org_id, lead_id: leadId, body: text.slice(0, 4000), visibility: "shared", source_label: sourceLabel, historic })
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("The note could not be saved.");
      return { id: (data as { id: string }).id };
    }
    if (resource === "tasks") {
      const text = typeof body.action === "string" ? body.action.trim() : "";
      if (!text) throw new Error("Write the task in action.");
      const { data, error } = await ctx.db
        .from("next_actions")
        .insert({
          org_id: ctx.key.org_id,
          lead_id: leadId,
          action_text: text.slice(0, 500),
          due_at: typeof body.due_at === "string" ? body.due_at : null,
          created_by: "user",
        })
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("The task could not be saved.");
      if (!historic) await afterWrite(ctx, "task.created", (data as { id: string }).id, leadId, sourceLabel, false);
      return { id: (data as { id: string }).id };
    }
    if (resource === "bookings") {
      const { data, error } = await ctx.db
        .from("calls")
        .insert({
          org_id: ctx.key.org_id,
          lead_id: leadId,
          type: "follow_up",
          scheduled_at: typeof body.scheduled_at === "string" ? body.scheduled_at : new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("The booking could not be saved.");
      if (!historic) await afterWrite(ctx, "booking.created", (data as { id: string }).id, leadId, sourceLabel, false);
      return { id: (data as { id: string }).id };
    }
    if (resource === "outcomes") {
      const amount = typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : 0;
      if (amount <= 0) throw new Error("amount_cents has to be a positive number of cents.");
      const { data, error } = await ctx.db
        .from("revenue_log")
        .insert({
          org_id: ctx.key.org_id,
          lead_id: leadId,
          amount_cents: amount,
          kind: body.kind === "refund" || body.kind === "chargeback" ? body.kind : "sale",
          payment_type: "pif",
          occurred_at: typeof body.occurred_at === "string" ? body.occurred_at : new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("The outcome could not be saved.");
      if (!historic) await afterWrite(ctx, "outcome.recorded", (data as { id: string }).id, leadId, sourceLabel, false);
      return { id: (data as { id: string }).id };
    }
    await ctx.db.from("lead_opt_outs").upsert(
      { lead_id: leadId, org_id: ctx.key.org_id, word: "API", channel: "api" },
      { onConflict: "lead_id" }
    );
    await ctx.db.from("leads").update({ do_not_contact: true, do_not_contact_at: new Date().toISOString() }).eq("id", leadId);
    if (!ctx.practice) {
      await emitWebhookEvent(ctx.db, { orgId: ctx.key.org_id, type: "opt_out.recorded", recordIds: [leadId], sourceLabel, practice: false });
    }
    return { id: leadId, opt_out: true };
  });
}

async function provenance(ctx: Ctx, table: string, id: string, sourceLabel: string, historic: boolean) {
  await ctx.db.from("record_provenance").insert({
    org_id: ctx.key.org_id,
    subject_table: table,
    subject_id: id,
    source_label: sourceLabel,
    historic,
  });
}

async function afterWrite(ctx: Ctx, type: string, id: string, leadId: string, sourceLabel: string, historic: boolean) {
  await provenance(ctx, type, id, sourceLabel, historic);
  if (!ctx.practice && !historic) {
    await emitWebhookEvent(ctx.db, { orgId: ctx.key.org_id, type, recordIds: [id, leadId], sourceLabel, practice: false });
  }
}

export { hashSecret, isApiScope };
