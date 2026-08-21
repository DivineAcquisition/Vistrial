import "server-only";

import { loadPrecallBrief } from "@/lib/brief/load";
import { generateVoiceSampleDraft } from "@/lib/follow-up/preview";
import { parseWebhookPayload } from "@/lib/ghl/payload";
import { persistGhlWebhookEvent } from "@/lib/ghl/ingest";
import { processGhlWebhookQueue } from "@/lib/ghl/process";
import { GOLIVE_CONTACT_PREFIX } from "@/lib/onboarding/constants";
import type { GoliveRunResult, GoliveStepId, GoliveStepResult, SetupStepId } from "@/lib/onboarding/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

function step(
  id: GoliveStepId,
  ok: boolean,
  label: string,
  detail: string,
  fixStep: SetupStepId | null = null
): GoliveStepResult {
  return { id, ok, label, detail, fixStep };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function runGoLiveCheck(args: {
  orgId: string;
  memberId: string;
  userId: string;
}): Promise<GoliveRunResult> {
  const db = getSupabaseAdmin();
  const steps: GoliveStepResult[] = [];

  const { data: run, error: runError } = await db
    .from("golive_runs")
    .insert({
      org_id: args.orgId,
      actor_user_id: args.userId,
      actor_member_id: args.memberId,
      status: "running",
      steps: [],
    })
    .select("id")
    .maybeSingle();
  if (runError || !run) throw new Error("Could not start the go-live check.");
  const runId = run.id;
  const contactId = `${GOLIVE_CONTACT_PREFIX}${runId.replace(/-/g, "").slice(0, 16)}`;

  const { data: org } = await db
    .from("organizations")
    .select("ghl_location_id")
    .eq("id", args.orgId)
    .maybeSingle();
  const locationId = org?.ghl_location_id;
  if (!locationId) {
    const failed = [
      step("ingest", false, "Ingest a test lead", "Connect the CRM first. There is no location to ingest into.", "crm"),
    ];
    await finish(runId, false, failed, null);
    return { ok: false, runId, steps: failed };
  }

  const { data: maps } = await db
    .from("ghl_field_maps")
    .select("ghl_field_id, ghl_field_key, answer_key")
    .eq("org_id", args.orgId);

  const customFields = (maps ?? []).flatMap((map) => {
    const id = map.ghl_field_id;
    if (!id) return [];
    const value =
      map.answer_key === "timeline" || map.answer_key === "timeline_signal"
        ? "immediately"
        : map.answer_key === "budget" || map.answer_key === "budget_signal"
          ? "15k"
          : map.answer_key === "authority"
            ? "I decide"
            : map.answer_key === "pain"
              ? "significant"
              : "immediately";
    return [{ id, value }];
  });

  const payload = {
    type: "ContactCreate",
    locationId,
    webhookId: `golive-${runId}`,
    id: contactId,
    contactId,
    firstName: "Vistrial",
    lastName: "Go-live",
    email: `golive+${runId.slice(0, 8)}@vistrial.invalid`,
    source: "vistrial_golive",
    customFields,
  };

  try {
    const raw = JSON.stringify(payload);
    const parsed = parseWebhookPayload(raw);
    const ingested = await persistGhlWebhookEvent(db, { parsed, orgId: args.orgId });
    if (ingested.httpStatus !== 200 || (!ingested.insertedId && !ingested.duplicate)) {
      steps.push(step("ingest", false, "Ingest a test lead", "The webhook row was not stored.", "crm"));
      await finish(runId, false, steps, null);
      return { ok: false, runId, steps };
    }
    await processGhlWebhookQueue(db, 5);
    const { data: lead } = await db
      .from("leads")
      .select("id, is_test, current_score, opted_in_at")
      .eq("org_id", args.orgId)
      .eq("ghl_contact_id", contactId)
      .maybeSingle();
    if (!lead) {
      steps.push(
        step("ingest", false, "Ingest a test lead", "The contact did not become a lead. Check CRM field mapping and ingestion.", "crm")
      );
      await finish(runId, false, steps, null);
      return { ok: false, runId, steps };
    }
    await db.from("leads").update({ golive_run_id: runId, is_test: true }).eq("id", lead.id).eq("org_id", args.orgId);
    steps.push(step("ingest", true, "Ingest a test lead", "The test contact went through the same persist-and-process path as a real webhook."));

    const inspect1 = await inspect(args.orgId, lead.id);
    const scored = typeof inspect1?.score === "number";
    steps.push(
      scored
        ? step("score", true, "Score using this org's mapping", `The lead scored ${inspect1?.score}.`)
        : step(
            "score",
            false,
            "Score using this org's mapping",
            "No readiness score was written. Map CRM fields onto the application answers scoring reads, then ingest a lead that carries those fields.",
            "field_mapping"
          )
    );
    if (!scored) {
      await cleanupLead(args.orgId, lead.id, contactId, locationId, runId);
      await finish(runId, false, steps, lead.id);
      return { ok: false, runId, steps };
    }

    const inQueueView = inspect1?.inQueueView === true;
    steps.push(
      inQueueView
        ? step("queue", false, "Appear in the expected queue position", "The test lead leaked into the live queue. Test leads must stay out of operator views.", null)
        : step(
            "queue",
            inspect1?.urgencyRank === 1,
            "Appear in the expected queue position",
            inspect1?.urgencyRank === 1
              ? "An untouched ready lead sits in the alarm band. The live queue correctly hid the test lead."
              : `Urgency rank was ${inspect1?.urgencyRank ?? "empty"}; an untouched new lead should be rank 1.`,
            "scoring"
          )
    );

    const { data: config } = await db
      .from("score_configs")
      .select("speed_to_lead_minutes")
      .eq("org_id", args.orgId)
      .maybeSingle();
    const windowMin = config?.speed_to_lead_minutes ?? 15;
    const backdated = new Date(Date.now() - (windowMin + 1) * 60_000).toISOString();
    await db.from("leads").update({ opted_in_at: backdated }).eq("id", lead.id).eq("org_id", args.orgId);
    const inspectAlarm = await inspect(args.orgId, lead.id);
    steps.push(
      inspectAlarm?.inAlarm
        ? step("alarm", true, "Speed-to-lead alarm", `The alarm fired after the ${windowMin}-minute window.`)
        : step(
            "alarm",
            false,
            "Speed-to-lead alarm",
            "The alarm did not fire after the configured window. Check speed-to-lead minutes on scoring.",
            "scoring"
          )
    );

    const { error: touchError } = await db.from("touches").insert({
      org_id: args.orgId,
      lead_id: lead.id,
      type: "human",
      channel: "call",
      direction: "outbound",
      outcome: "connected",
      actor_member_id: args.memberId,
      summary: "Go-live verification touch",
    });
    const inspectTouch = await inspect(args.orgId, lead.id);
    steps.push(
      !touchError && inspectTouch?.firstHumanTouchAt && inspectTouch.inAlarm === false
        ? step("touch", true, "Human touch clears the alarm", "Logging a human touch cleared first_human_touch_at and the alarm.")
        : step("touch", false, "Human touch clears the alarm", touchError?.message ?? "The alarm stayed on after a human touch.", "team")
    );

    const appointmentId = `golive-appt-${runId.slice(0, 8)}`;
    const booked = {
      type: "AppointmentCreate",
      locationId,
      webhookId: `golive-appt-${runId}`,
      contactId,
      appointment: {
        id: appointmentId,
        contactId,
        startTime: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    };
    await persistGhlWebhookEvent(db, { parsed: parseWebhookPayload(JSON.stringify(booked)), orgId: args.orgId });
    await processGhlWebhookQueue(db, 5);
    const { data: call } = await db
      .from("calls")
      .select("id")
      .eq("org_id", args.orgId)
      .eq("lead_id", lead.id)
      .maybeSingle();
    let briefOk = false;
    if (call) {
      try {
        const brief = await loadPrecallBrief(lead.id);
        briefOk = Boolean(brief?.lead.id);
      } catch {
        briefOk = false;
      }
    }
    steps.push(
      briefOk
        ? step("brief", true, "Pre-call brief renders", "The brief loaded for the test lead after an appointment ingest.")
        : step(
            "brief",
            false,
            "Pre-call brief renders",
            "The brief did not render. Confirm the CRM appointment path and that the case file loads.",
            "crm"
          )
    );

    const transcript =
      'Closer: What is the timeline looking like?\nMaya: We want to start this quarter.\nCloser: Next step?\nMaya: Send me the Tuesday callback.';
    if (call) {
      await db
        .from("calls")
        .update({
          raw_transcript: transcript,
          occurred_at: new Date().toISOString(),
          outcome: "held",
          transcript_source: "manual",
          transcript_arrived_at: new Date().toISOString(),
        })
        .eq("id", call.id)
        .eq("org_id", args.orgId);
    }
    let draftOk = false;
    let draftDetail = "Could not generate a draft.";
    try {
      const preview = await generateVoiceSampleDraft(db, {
        orgId: args.orgId,
        lead: { firstName: "Vistrial", source: "vistrial_golive", offerName: null },
        transcript,
      });
      draftOk = preview.quality.ok;
      draftDetail = preview.quality.ok
        ? "A draft generated from this org's voice profile passed the quality check."
        : `The draft failed quality: ${preview.quality.failures.map((item) => item.type).join(", ")}. Add real voice examples.`
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "draft_failed";
      draftDetail =
        message === "missing_api_key"
          ? "Draft generation needs an Anthropic key on this deployment."
          : "Draft generation failed. Check the voice profile and try again.";
    }
    steps.push(
      step("draft", draftOk, "Draft with this org's voice", draftDetail, draftOk ? null : "voice")
    );

    await cleanupLead(args.orgId, lead.id, contactId, locationId, runId);
    const { data: leftover } = await db
      .from("leads")
      .select("id")
      .eq("id", lead.id)
      .maybeSingle();
    const { data: inQueue } = await db.from("queue_rows").select("id").eq("id", lead.id).maybeSingle();
    const { data: inCases } = await db.from("case_file_rows").select("id").eq("id", lead.id).maybeSingle();
    const gone = !leftover && !inQueue && !inCases;
    steps.push(
      gone
        ? step("cleanup", true, "Remove the test lead", "The test lead is gone. It appears in no queue, case file, or leftover row.")
        : step("cleanup", false, "Remove the test lead", "The test lead was not fully removed. Delete it before trusting metrics.", null)
    );

    const ok = steps.every((item) => item.ok);
    await finish(runId, ok, steps, null);
    return { ok, runId, steps };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "golive_failed";
    steps.push(step("ingest", false, "Go-live check", message, "review"));
    const { data: leftover } = await db
      .from("leads")
      .select("id")
      .eq("org_id", args.orgId)
      .eq("ghl_contact_id", contactId)
      .maybeSingle();
    if (leftover) await cleanupLead(args.orgId, leftover.id, contactId, locationId, runId);
    await finish(runId, false, steps, leftover?.id ?? null);
    return { ok: false, runId, steps };
  }
}

async function inspect(orgId: string, leadId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.rpc("golive_inspect_lead", { p_org_id: orgId, p_lead_id: leadId });
  const row = asRecord(data);
  if (!row) return null;
  return {
    score: typeof row.score === "number" ? row.score : null,
    inAlarm: row.inAlarm === true || row.in_alarm === true,
    urgencyRank: typeof row.urgencyRank === "number" ? row.urgencyRank : typeof row.urgency_rank === "number" ? row.urgency_rank : null,
    firstHumanTouchAt:
      typeof row.firstHumanTouchAt === "string"
        ? row.firstHumanTouchAt
        : typeof row.first_human_touch_at === "string"
          ? row.first_human_touch_at
          : null,
    inQueueView: row.inQueueView === true || row.in_queue_view === true,
  };
}

async function cleanupLead(
  orgId: string,
  leadId: string,
  contactId: string,
  locationId: string | null,
  runId: string
) {
  const db = getSupabaseAdmin();
  await db.from("leads").delete().eq("id", leadId).eq("org_id", orgId);
  if (locationId) {
    await db.from("webhook_events").delete().eq("org_id", orgId).eq("contact_key", `${locationId}:${contactId}`);
  }
  await db.from("webhook_events").delete().eq("org_id", orgId).eq("provider_event_id", `golive-${runId}`);
  await db.from("webhook_events").delete().eq("org_id", orgId).eq("provider_event_id", `golive-appt-${runId}`);
}

async function finish(runId: string, ok: boolean, steps: GoliveStepResult[], leadId: string | null) {
  const db = getSupabaseAdmin();
  await db
    .from("golive_runs")
    .update({
      status: ok ? "passed" : "failed",
      steps: steps as unknown as Json,
      lead_id: leadId,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}
