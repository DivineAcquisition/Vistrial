import { redirect } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { decideProposal, publishAssayRules } from "@/app/(workspace)/app/team/assay/actions";
import { getAuthContext } from "@/lib/auth/session";
import { scoreLead } from "@/lib/assay/score";
import { emptyFacts } from "@/lib/assay/types";
import { templateRuleset } from "@/lib/assay/rulesets";
import { rulesetFromRow } from "@/lib/assay/serialize";
import { winRateByTier } from "@/lib/assay/accuracy";
import { addedSignalCostUsd, scoringComputeNote } from "@/lib/assay/cost";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Assay rules" };

type Loose = SupabaseClient;

export default async function AssayStaffPage() {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) redirect("/app/settings/assay");
  const db = getSupabaseAdmin() as unknown as Loose;
  const { data: active } = await db.from("assay_rule_versions").select("*").eq("org_id", ctx.org.id).eq("active", true).maybeSingle();
  const rules = active ? rulesetFromRow(active as Record<string, unknown>) : templateRuleset("home-services");
  const before = scoreLead({ facts: { ...emptyFacts(), contactComplete: true }, ruleset: rules, previousTier: null });
  const after = scoreLead({ facts: { ...emptyFacts(), contactComplete: true, booked: true, serviceMatch: true, insideServiceArea: true }, ruleset: rules, previousTier: null });
  const { data: proposals } = await db.from("assay_proposals").select("id, status, summary, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(5);
  const { data: requests } = await db.from("assay_change_requests").select("id, note, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(8);
  const { data: daily } = await db.from("assay_daily").select("day, cap_hit").eq("org_id", ctx.org.id).order("day", { ascending: false }).limit(7);
  const accuracy = winRateByTier([], 20);

  return (
    <PageFrame title="Assay" description="Rules, a preview, and learned proposals. Nothing changes until you publish.">
      <div className="space-y-6 text-sm">
        <p>
          Preview on two sample leads with the active rules: a new contact scores {before.tier} {before.score}{before.early ? " (early)" : ""}. A booked in-area lead scores {after.tier} {after.score}.
        </p>
        <p>{scoringComputeNote(0)} Extra call reading costs about ${addedSignalCostUsd().toFixed(4)} per call. {accuracy.flag ?? "Not enough closed deals yet to judge the tiers."}</p>
        <form action={publishAssayRules} className="space-y-2">
          <label className="block font-medium" htmlFor="publish-note">Publish a new version</label>
          <textarea id="publish-note" name="note" required minLength={3} className="min-h-20 w-full rounded-md border border-border bg-background p-2" placeholder="What changed, and why" />
          <button className="rounded-md border border-border px-3 py-2" type="submit">Publish</button>
        </form>
        <section>
          <h2 className="font-medium">Learned proposals</h2>
          <ul className="mt-2 space-y-3">
            {((proposals ?? []) as Array<{ id: string; status: string; summary: { reason?: string }; created_at: string }>).map((proposal) => (
              <li key={proposal.id} className="rounded-md border border-border p-3">
                <p>{proposal.summary?.reason ?? proposal.status}</p>
                {proposal.status === "pending" ? (
                  <form action={decideProposal} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={proposal.id} />
                    <button className="rounded-md border border-border px-3 py-1" name="choice" value="published" type="submit">Publish</button>
                    <button className="rounded-md border border-border px-3 py-1" name="choice" value="dismissed" type="submit">Dismiss</button>
                  </form>
                ) : (
                  <p className="text-muted-foreground">{proposal.status}</p>
                )}
              </li>
            ))}
            {(proposals ?? []).length === 0 ? <li>No proposal yet. Learning starts after 40 closed deals.</li> : null}
          </ul>
        </section>
        <section>
          <h2 className="font-medium">Change requests</h2>
          <ul className="mt-2 space-y-2">
            {((requests ?? []) as Array<{ id: string; note: string }>).map((request) => (
              <li key={request.id}>{request.note}</li>
            ))}
            {(requests ?? []).length === 0 ? <li>None waiting.</li> : null}
          </ul>
        </section>
        <section>
          <h2 className="font-medium">Caps</h2>
          <ul className="mt-2 space-y-1">
            {((daily ?? []) as Array<{ day: string; cap_hit: string | null }>).map((row) => (
              <li key={row.day}>{row.day}: {row.cap_hit ? `Hit the ${row.cap_hit} cap` : "Within the caps"}</li>
            ))}
            {(daily ?? []).length === 0 ? <li>No cap has been hit.</li> : null}
          </ul>
        </section>
        <p className="text-xs text-muted-foreground">Active version {rules.version}. {rules.note}</p>
      </div>
    </PageFrame>
  );
}
