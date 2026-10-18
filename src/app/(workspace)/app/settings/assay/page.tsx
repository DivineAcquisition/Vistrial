import { PageFrame } from "@/components/app/page-frame";
import { confirmAssayWritebackForm, requestAssayChangeForm } from "@/app/(workspace)/app/settings/assay/actions";
import { getAuthContext } from "@/lib/auth/session";
import { LEARNING_NOTE } from "@/lib/assay/copy";
import { templateForSlug, templateRuleset } from "@/lib/assay/rulesets";
import { rulesetFromRow } from "@/lib/assay/serialize";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "How Assay scores leads" };

type Loose = SupabaseClient;

export default async function AssayHowPage() {
  const ctx = await getAuthContext();
  const operator = ctx.workspaceRole === "operator" && !ctx.isStaff;
  const db = (await createClient()) as unknown as Loose;
  const { data: org } = await db.from("organizations").select("industry_template_id").eq("id", ctx.org.id).maybeSingle();
  let slug = "home-services";
  const templateId = (org as { industry_template_id?: string | null } | null)?.industry_template_id;
  if (templateId) {
    const { data: tpl } = await db.from("config_templates").select("slug").eq("id", templateId).maybeSingle();
    slug = templateForSlug((tpl as { slug?: string } | null)?.slug);
  }
  let rules = templateRuleset(templateForSlug(slug));
  const { data: active } = await db.from("assay_rule_versions").select("*").eq("org_id", ctx.org.id).eq("active", true).maybeSingle();
  if (active) {
    try {
      rules = rulesetFromRow(active as Record<string, unknown>);
    } catch {
      rules = templateRuleset(templateForSlug(slug));
    }
  }
  const { data: writeback } = await db.from("assay_writeback").select("enabled, owner_confirmed_at").eq("org_id", ctx.org.id).maybeSingle();
  const write = writeback as { enabled?: boolean; owner_confirmed_at?: string | null } | null;

  return (
    <PageFrame title="How Assay scores leads" description="The rules behind the lead score. Owners and members can read them. The Vistrial team changes them.">
      {operator ? (
        <p className="text-sm text-muted-foreground">Your workspace owner can open the full rules. You still see the tier and the reasons on each lead.</p>
      ) : (
        <div className="space-y-6 text-sm">
          <p>{LEARNING_NOTE}</p>
          <p>
            Fit {rules.weights.fit}%, activity {rules.weights.engagement}%, call signals {rules.weights.call}%. Hot starts at {rules.tiers.hot}. A lead moves up right away and moves down only after it falls {rules.tiers.stickiness} points below the line.
          </p>
          <ul className="space-y-2">
            {rules.rules.filter((rule) => rule.enabled).map((rule) => (
              <li key={rule.id} className="rounded-md border border-border p-3">
                <span className="font-medium">{rule.name}</span>
                <span className="text-muted-foreground"> · {rule.points > 0 ? `+${rule.points}` : rule.points} · {rule.part}</span>
                <p>{rule.reason}</p>
              </li>
            ))}
          </ul>
          <p>
            Triggers: became Hot {rules.triggers.becameHot ? "on" : "off"}, score jump of {rules.triggers.bigJumpPoints} {rules.triggers.bigJump ? "on" : "off"}, quiet after {rules.triggers.goingQuietDays} days, missed booking {rules.triggers.hotNoShow ? "on" : "off"}.
          </p>
          <form action={requestAssayChangeForm} className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="assay-note">Request a change</label>
            <textarea id="assay-note" name="note" className="min-h-24 w-full rounded-md border border-border bg-background p-2" maxLength={500} />
            <button className="rounded-md border border-border px-3 py-2" type="submit">Send to the Vistrial team</button>
          </form>
          {ctx.workspaceRole === "owner" && write?.enabled && !write.owner_confirmed_at ? (
            <form action={confirmAssayWritebackForm}>
              <p>Writeback of the tier only is waiting for your confirmation. The number and the reasons stay in Vistrial.</p>
              <button className="mt-2 rounded-md border border-border px-3 py-2" type="submit">Confirm tier writeback</button>
            </form>
          ) : null}
        </div>
      )}
    </PageFrame>
  );
}
