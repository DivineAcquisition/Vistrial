"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { noteLeadForAssay } from "@/lib/assay/enqueue";
import { cloneRuleset, templateRuleset } from "@/lib/assay/rulesets";
import { rulesetFromRow, rulesetToRow } from "@/lib/assay/serialize";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type Loose = SupabaseClient;

function admin(): Loose {
  return getSupabaseAdmin() as unknown as Loose;
}

export async function publishAssayRules(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return;
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 3) return;
  const db = admin();
  const { data: current } = await db.from("assay_rule_versions").select("*").eq("org_id", ctx.org.id).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
  const base = current ? rulesetFromRow(current as Record<string, unknown>) : templateRuleset("home-services");
  const version = (current ? Number((current as { version?: number }).version ?? 1) : 0) + 1;
  const next = cloneRuleset(base, { id: crypto.randomUUID(), version, note });
  if (current) await db.from("assay_rule_versions").update({ active: false }).eq("org_id", ctx.org.id).eq("active", true);
  const row = rulesetToRow(next, ctx.org.id);
  await db.from("assay_rule_versions").insert({ ...row, id: next.id, active: true });
  const { data: leads } = await db.from("leads").select("id, status").eq("org_id", ctx.org.id).eq("is_test", false).limit(300);
  for (const lead of ((leads ?? []) as Array<{ id: string; status: string }>).filter((row) => row.status !== "closed_won" && row.status !== "closed_lost").slice(0, 200)) {
    await noteLeadForAssay({ orgId: ctx.org.id, leadId: lead.id, eventKey: `rules:${version}:${lead.id}`, mode: "rules_change" });
  }
  revalidatePath("/app/settings/assay");
  revalidatePath("/app/team/assay");
}

export async function decideProposal(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return;
  const id = String(formData.get("id") ?? "");
  const choice = String(formData.get("choice") ?? "");
  if (!id || (choice !== "published" && choice !== "dismissed")) return;
  const db = admin();
  if (choice === "dismissed") {
    await db.from("assay_proposals").update({ status: "dismissed", decided_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.org.id);
    revalidatePath("/app/team/assay");
    return;
  }
  const { data: proposal } = await db.from("assay_proposals").select("summary").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  const summary = (proposal as { summary?: { changes?: Array<{ ruleId: string; to: number }>; weights?: { fit: number; engagement: number; call: number } } } | null)?.summary;
  const { data: current } = await db.from("assay_rule_versions").select("*").eq("org_id", ctx.org.id).eq("active", true).maybeSingle();
  if (current && summary?.changes) {
    const base = rulesetFromRow(current as Record<string, unknown>);
    const rules = base.rules.map((rule) => {
      const change = summary.changes?.find((item) => item.ruleId === rule.id);
      return change ? { ...rule, points: change.to } : rule;
    });
    const version = Number((current as { version?: number }).version ?? 1) + 1;
    const next = cloneRuleset(base, {
      id: crypto.randomUUID(),
      version,
      note: "Published a learned proposal.",
      rules,
      weights: summary.weights ?? base.weights,
    });
    await db.from("assay_rule_versions").update({ active: false }).eq("org_id", ctx.org.id).eq("active", true);
    await db.from("assay_rule_versions").insert({ ...rulesetToRow(next, ctx.org.id), id: next.id, active: true });
  }
  await db.from("assay_proposals").update({ status: "published", decided_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.org.id);
  revalidatePath("/app/team/assay");
}
