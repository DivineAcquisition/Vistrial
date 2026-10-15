"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanText } from "@/lib/access-requests/validate";
import { transactionalEmailHtml } from "@/lib/email/layout";
import { resendConfigured } from "@/lib/notifications/env";
import { requestIp } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";

export type TrustFormState = {
  ok: boolean;
  message: string;
  errors: Partial<Record<string, string>>;
};

export async function submitTrustForm(_prev: TrustFormState, form: FormData): Promise<TrustFormState> {
  const kind = String(form.get("kind") ?? "");
  const errors: TrustFormState["errors"] = {};
  const fullName = cleanText(form.get("full_name"), 120);
  const email = cleanText(form.get("email"), 200).toLowerCase();
  const business = cleanText(form.get("business_name"), 160);
  const role = cleanText(form.get("role"), 80);
  const details = cleanText(form.get("details"), 2000);
  if (!fullName) errors.full_name = "This field is required.";
  if (!email.includes("@")) errors.email = "Enter a work email, like name@company.com.";
  if (!business) errors.business_name = "This field is required.";
  if (kind === "security_review" && !role) errors.role = "This field is required.";
  if (kind === "vulnerability" && !details) errors.details = "Tell us what you found.";
  if (form.get("consent") !== "yes") errors.consent = "Check the box so we can reply about this request.";
  if (Object.keys(errors).length) {
    return { ok: false, message: "Check the fields below and try again.", errors };
  }
  const ip = requestIp(await headers());
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    const { data, error } = await db.rpc("submit_trust_request", {
      p_payload: {
        kind: kind === "vulnerability" ? "vulnerability" : "security_review",
        fullName,
        email,
        businessName: business,
        role,
        needs: form.getAll("needs").map(String),
        deadline: String(form.get("deadline") ?? ""),
        details,
        consent: "true",
        honeypot: cleanText(form.get("company_website_confirm"), 200),
      },
      p_ip: ip.slice(0, 80),
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      const code = (data as { code?: string } | null)?.code;
      return {
        ok: false,
        message: code === "rate" ? "Please wait a few minutes and try again." : "We could not submit that just now. Try again in a moment.",
        errors: {},
      };
    }
    if (!cleanText(form.get("company_website_confirm"), 200)) {
      await sendTrustConfirmation(email, fullName, kind === "vulnerability");
    }
  } catch {
    return { ok: false, message: "We could not submit that just now. Try again in a moment.", errors: {} };
  }
  redirect(kind === "vulnerability" ? "/thanks?kind=report" : "/thanks?kind=review");
}

async function sendTrustConfirmation(email: string, name: string, vulnerability: boolean) {
  const cfg = resendConfigured();
  if (!cfg) return;
  const safe = name.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  const lines = vulnerability
    ? [`Hello ${safe},`, "We received your security report. A person will reply from contact@vistrial.io.", "This note does not include the details you submitted."]
    : [`Hello ${safe},`, "We received your security review request. A person will reply from contact@vistrial.io.", "This note does not include the details you submitted."];
  const html = transactionalEmailHtml({
    heading: vulnerability ? "Security report received" : "Security review request received",
    lines: lines.slice(1),
  });
  try {
    await new Resend(cfg.apiKey).emails.send({
      from: cfg.from,
      to: email,
      subject: vulnerability ? "We received your security report" : "We received your security review request",
      html,
      text: lines.join("\n\n"),
    });
  } catch {
    /* the request is already saved */
  }
}
