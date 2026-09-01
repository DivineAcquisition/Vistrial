"use server";

import { revalidatePath } from "next/cache";

import { requireForsightOperator } from "@/lib/forsight/operator";
import { generateReport } from "@/lib/forsight/report/generate";
import { loadStoredReport, periodPath } from "@/lib/forsight/report/load";
import { sendStoredReport } from "@/lib/forsight/report/send";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export type ReportActionResult = { ok: true; detail: string } | { ok: false; error: string };

export async function generateWorkspaceReport(args: {
  orgId: string;
  periodStart: string;
}): Promise<ReportActionResult> {
  const ctx = await requireForsightOperator();
  if (!ctx) return { ok: false, error: "Not found." };

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", args.orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Workspace not found." };

  const result = await generateReport({
    db: supabase,
    orgId: org.id,
    orgName: org.name,
    periodStart: args.periodStart,
    actor: {
      kind: "operator",
      memberId: ctx.member.id,
      name: ctx.member.displayName || ctx.member.email,
    },
    replace: true,
  });

  if (result.status !== "generated") {
    return { ok: false, error: result.reason };
  }

  revalidatePath(`${FORSIGHT_PATH}/reports`);
  revalidatePath(`${FORSIGHT_PATH}/reports/${periodPath(args.periodStart)}`);
  revalidatePath(`${FORSIGHT_PATH}/workspaces`);
  return {
    ok: true,
    detail: `Generated ${result.stored.report.period.label} version ${result.stored.version}. Nothing was sent.`,
  };
}

export async function sendWorkspaceReport(args: {
  orgId: string;
  periodStart: string;
  version?: number;
}): Promise<ReportActionResult> {
  const ctx = await requireForsightOperator();
  if (!ctx) return { ok: false, error: "Not found." };

  const supabase = await createClient();
  const stored = await loadStoredReport(supabase, {
    orgId: args.orgId,
    periodStart: args.periodStart,
    version: args.version,
  });
  if (!stored) return { ok: false, error: "No report for that period." };

  const result = await sendStoredReport({
    db: supabase,
    stored,
    sentBy: { memberId: ctx.member.id, email: ctx.member.email },
  });

  if (result.status !== "sent") return { ok: false, error: result.reason };

  revalidatePath(`${FORSIGHT_PATH}/reports/${periodPath(args.periodStart)}`);
  revalidatePath(`${FORSIGHT_PATH}/workspaces`);
  return {
    ok: true,
    detail: `Sent version ${stored.version} to ${result.recipients.join(", ")}.`,
  };
}
