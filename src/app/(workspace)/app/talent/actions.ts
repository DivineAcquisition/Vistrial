"use server";

import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { addApplicant, saveDraft, setApplicantStage, submitInterview } from "@/lib/talent/data";
import { parseInterviewForm } from "@/lib/talent/parse";
import { STAGES, type ApplicantStage } from "@/lib/talent/questions";

function isId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

async function staff() {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return null;
  return ctx;
}

export async function addApplicantAction(form: FormData) {
  const ctx = await staff();
  if (!ctx) redirect("/app/talent");
  const fullName = String(form.get("fullName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (fullName.length < 2 || !email.includes("@")) {
    redirect("/app/talent?error=Name%20and%20email%20are%20required.");
  }
  const result = await addApplicant({ fullName, email, phone, note });
  if (!result.ok) redirect(`/app/talent?error=${encodeURIComponent(result.error)}`);
  redirect(`/app/talent/${result.id}`);
}

export async function interviewAction(form: FormData) {
  const ctx = await staff();
  const applicantId = String(form.get("applicantId") ?? "");
  if (!ctx || !isId(applicantId)) redirect("/app/talent");
  const draft = parseInterviewForm(form);
  const who = { applicantId, interviewerUserId: ctx.user.id, interviewerName: ctx.member.displayName || ctx.member.email, draft };
  if (String(form.get("intent") ?? "") === "submit") {
    const result = await submitInterview(who);
    if (!result.ok) redirect(`/app/talent/${applicantId}?error=${encodeURIComponent(result.error)}`);
    redirect(`/app/talent/${applicantId}?submitted=1`);
  }
  const saved = await saveDraft(who);
  if (!saved.ok) redirect(`/app/talent/${applicantId}?error=${encodeURIComponent(saved.error)}`);
  redirect(`/app/talent/${applicantId}?saved=1`);
}

export async function setStageAction(form: FormData) {
  const ctx = await staff();
  const applicantId = String(form.get("applicantId") ?? "");
  const stage = String(form.get("stage") ?? "");
  if (!ctx || !isId(applicantId) || !STAGES.includes(stage as ApplicantStage)) redirect("/app/talent");
  const result = await setApplicantStage(applicantId, stage as ApplicantStage);
  if (!result.ok) redirect(`/app/talent/${applicantId}?error=${encodeURIComponent(result.error)}`);
  redirect(`/app/talent/${applicantId}?saved=1`);
}
