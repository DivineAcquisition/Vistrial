import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { QUESTION_IDS, type ApplicantStage } from "@/lib/talent/questions";
import { parseInterviewForm, toScoreInput, type InterviewDraft } from "@/lib/talent/parse";
import { scoreInterview, type Decision, type Precheck, type RoleplayChecks, type Scorecard, type ScoreInput } from "@/lib/talent/score";

type Row = Record<string, unknown>;

async function db(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export type Applicant = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  stage: ApplicantStage;
  timezone: string | null;
  availability: string | null;
  source: string;
  note: string | null;
  createdAt: string;
};

export type InterviewRecord = {
  id: string;
  applicantId: string;
  status: "draft" | "submitted";
  interviewerName: string | null;
  precheck: Precheck;
  draft: InterviewDraft;
  scorecard: Scorecard | null;
  submittedAt: string | null;
};

export type ApplicantListItem = Applicant & {
  finalScore: number | null;
  decision: Decision | null;
};

const EMPTY_PRECHECK: Precheck = {
  availability: "",
  timezone: "",
  quietSpace: false,
  reliableInternet: false,
  headset: false,
  computer: false,
  crm: "",
  canStartSoon: false,
};

function applicantFrom(row: Row): Applicant {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    stage: String(row.stage) as ApplicantStage,
    timezone: row.timezone ? String(row.timezone) : null,
    availability: row.availability ? String(row.availability) : null,
    source: String(row.source),
    note: row.note ? String(row.note) : null,
    createdAt: String(row.created_at),
  };
}

function draftFrom(row: Row): InterviewDraft {
  const answers = (row.answers ?? {}) as Record<string, { answer?: string; probe?: string; quote?: string; score?: number | null }>;
  const built = {} as InterviewDraft["answers"];
  for (const id of QUESTION_IDS) {
    const item = answers[id] ?? {};
    built[id] = {
      answer: item.answer ?? "",
      probe: item.probe ?? "",
      quote: item.quote ?? "",
      score: typeof item.score === "number" ? item.score : null,
    };
  }
  const precheck = { ...EMPTY_PRECHECK, ...((row.precheck ?? {}) as Partial<Precheck>) };
  const roleplay = {
    acknowledged: false,
    noInventedPrice: false,
    asked: false,
    twoTimes: false,
    brief: false,
    ...((row.roleplay ?? {}) as Partial<RoleplayChecks>),
  };
  return { precheck, answers: built, roleplay, dishonesty: row.dishonesty === true };
}

function interviewFrom(row: Row): InterviewRecord {
  const draft = draftFrom(row);
  return {
    id: String(row.id),
    applicantId: String(row.applicant_id),
    status: row.status === "submitted" ? "submitted" : "draft",
    interviewerName: row.interviewer_name ? String(row.interviewer_name) : null,
    precheck: draft.precheck,
    draft,
    scorecard: (row.scorecard as Scorecard | null) ?? null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
  };
}

function payload(draft: InterviewDraft) {
  const answers: Record<string, { answer: string; probe: string; quote: string; score: number | null }> = {};
  for (const id of QUESTION_IDS) answers[id] = draft.answers[id];
  return {
    precheck: draft.precheck,
    answers,
    roleplay: draft.roleplay,
    dishonesty: draft.dishonesty,
  };
}

export async function listApplicants(): Promise<ApplicantListItem[]> {
  const client = await db();
  const [{ data: people, error }, { data: interviews }] = await Promise.all([
    client.from("talent_applicants").select("id, full_name, email, phone, stage, timezone, availability, source, note, created_at").order("created_at", { ascending: false }),
    client.from("talent_interviews").select("applicant_id, scorecard, submitted_at").eq("status", "submitted").order("submitted_at", { ascending: false }),
  ]);
  if (error) return [];
  const latest = new Map<string, Scorecard>();
  for (const row of (interviews ?? []) as Row[]) {
    const id = String(row.applicant_id);
    if (!latest.has(id) && row.scorecard) latest.set(id, row.scorecard as Scorecard);
  }
  return ((people ?? []) as Row[]).map((row) => {
    const person = applicantFrom(row);
    const card = latest.get(person.id);
    return { ...person, finalScore: card?.finalScore ?? null, decision: card?.decision ?? null };
  });
}

export async function getApplicant(id: string): Promise<Applicant | null> {
  const client = await db();
  const { data } = await client.from("talent_applicants").select("id, full_name, email, phone, stage, timezone, availability, source, note, created_at").eq("id", id).maybeSingle();
  return data ? applicantFrom(data as Row) : null;
}

export async function interviewsFor(applicantId: string): Promise<InterviewRecord[]> {
  const client = await db();
  const { data } = await client
    .from("talent_interviews")
    .select("id, applicant_id, status, interviewer_name, precheck, answers, roleplay, dishonesty, scorecard, submitted_at")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Row[]).map(interviewFrom);
}

export async function getSubmittedInterview(id: string): Promise<{ interview: InterviewRecord; applicant: Applicant } | null> {
  const client = await db();
  const { data } = await client
    .from("talent_interviews")
    .select("id, applicant_id, status, interviewer_name, precheck, answers, roleplay, dishonesty, scorecard, submitted_at")
    .eq("id", id)
    .eq("status", "submitted")
    .maybeSingle();
  if (!data) return null;
  const interview = interviewFrom(data as Row);
  const applicant = await getApplicant(interview.applicantId);
  if (!applicant || !interview.scorecard) return null;
  return { interview, applicant };
}

async function ensureDraft(client: SupabaseClient, applicantId: string, interviewerUserId: string, interviewerName: string): Promise<string | null> {
  const { data: existing } = await client.from("talent_interviews").select("id").eq("applicant_id", applicantId).eq("status", "draft").maybeSingle();
  if (existing && typeof (existing as Row).id === "string") return String((existing as Row).id);
  const { data, error } = await client
    .from("talent_interviews")
    .insert({ applicant_id: applicantId, status: "draft", interviewer_user_id: interviewerUserId, interviewer_name: interviewerName })
    .select("id")
    .single();
  if (error || !data) return null;
  return String((data as Row).id);
}

export async function saveDraft(args: {
  applicantId: string;
  interviewerUserId: string;
  interviewerName: string;
  draft: InterviewDraft;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await db();
  const id = await ensureDraft(client, args.applicantId, args.interviewerUserId, args.interviewerName);
  if (!id) return { ok: false, error: "Could not open the interview. Reload and try again." };
  const { error } = await client.from("talent_interviews").update({ ...payload(args.draft), interviewer_user_id: args.interviewerUserId, interviewer_name: args.interviewerName }).eq("id", id).eq("status", "draft");
  if (error) return { ok: false, error: "Could not save the interview." };
  await client.from("talent_applicants").update({ stage: "screening" }).eq("id", args.applicantId).eq("stage", "applied");
  return { ok: true };
}

const STAGE_FOR_DECISION: Record<Decision, ApplicantStage> = {
  advance: "advance",
  second: "second",
  decline: "declined",
  hold: "hold",
};

export async function submitInterview(args: {
  applicantId: string;
  interviewerUserId: string;
  interviewerName: string;
  draft: InterviewDraft;
}): Promise<{ ok: true; interviewId: string } | { ok: false; error: string }> {
  const parsed = toScoreInput(args.draft);
  if (!parsed.ok) return parsed;
  const scored = scoreInterview(parsed.input);
  if (!scored.ok) return scored;
  const client = await db();
  const id = await ensureDraft(client, args.applicantId, args.interviewerUserId, args.interviewerName);
  if (!id) return { ok: false, error: "Could not open the interview. Reload and try again." };
  const { error } = await client
    .from("talent_interviews")
    .update({
      ...payload(args.draft),
      interviewer_user_id: args.interviewerUserId,
      interviewer_name: args.interviewerName,
      status: "submitted",
      scorecard: scored.card,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, error: "Could not submit the interview." };
  await client.from("talent_applicants").update({ stage: STAGE_FOR_DECISION[scored.card.decision] }).eq("id", args.applicantId);
  return { ok: true, interviewId: id };
}

export async function addApplicant(args: { fullName: string; email: string; phone: string; note: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const client = await db();
  const { data, error } = await client
    .from("talent_applicants")
    .insert({
      full_name: args.fullName,
      email: args.email.toLowerCase(),
      phone: args.phone || null,
      note: args.note || null,
      source: "staff",
      stage: "applied",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That email is already an applicant." };
    return { ok: false, error: "Could not add the applicant." };
  }
  return { ok: true, id: String((data as Row).id) };
}

export async function setApplicantStage(id: string, stage: ApplicantStage): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await db();
  const { error } = await client.from("talent_applicants").update({ stage }).eq("id", id);
  if (error) return { ok: false, error: "Could not change the stage." };
  return { ok: true };
}

export function scoreInputsFrom(records: InterviewRecord[]): ScoreInput[] {
  const inputs: ScoreInput[] = [];
  for (const record of records) {
    if (record.status !== "submitted") continue;
    const parsed = toScoreInput(record.draft);
    if (parsed.ok) inputs.push(parsed.input);
  }
  return inputs;
}

export function blankDraft(applicant: Applicant): InterviewDraft {
  const answers = {} as InterviewDraft["answers"];
  for (const id of QUESTION_IDS) answers[id] = { answer: "", probe: "", quote: "", score: null };
  return {
    precheck: {
      ...EMPTY_PRECHECK,
      availability: applicant.availability ?? "",
      timezone: applicant.timezone ?? "",
    },
    answers,
    roleplay: { acknowledged: false, noInventedPrice: false, asked: false, twoTimes: false, brief: false },
    dishonesty: false,
  };
}

export { parseInterviewForm };
