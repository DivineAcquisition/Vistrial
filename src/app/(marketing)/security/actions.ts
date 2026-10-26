"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { cleanText } from "@/lib/access-requests/validate";
import { capturePublicRequest } from "@/lib/marketing/capture";
import { requestIp, verifyTurnstile } from "@/lib/marketing/turnstile";

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
  if (cleanText(form.get("company_website_confirm"), 200)) {
    redirect(kind === "vulnerability" ? "/thanks?kind=report" : "/thanks?kind=review");
  }
  const human = await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), requestIp(await headers()));
  if (!human) return { ok: false, message: "We could not submit that just now. Try again in a moment.", errors: {} };
  const saved = await capturePublicRequest({
    kind: kind === "vulnerability" ? "vulnerability" : "security_review",
    email,
    name: fullName,
    detail: [business, role, details].filter(Boolean).join("\n"),
  });
  if (!saved.ok) return { ok: false, message: saved.message, errors: {} };
  redirect(kind === "vulnerability" ? "/thanks?kind=report" : "/thanks?kind=review");
}
