import { PageFrame } from "@/components/app/page-frame";
import { FollowUpSettingsScreen } from "@/app/app/settings/follow-up/follow-up-settings";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { loadFollowUpSettings, loadRoutingRules, loadVoiceProfile } from "@/lib/follow-up/load";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";
import { assertProductScope } from "@/lib/product-scope-guard";
import { createClient } from "@/lib/supabase/server";

export default async function FollowUpSettingsPage() {
  assertProductScope("followUpSettings");
  const ctx = await requireOrgSettingsManager();
  const supabase = await createClient();
  const [settings, voice, rules, suggestions] = await Promise.all([
    loadFollowUpSettings(ctx.org.id),
    loadVoiceProfile(ctx.org.id),
    loadRoutingRules(ctx.org.id),
    supabase
      .from("voice_profile_suggestions")
      .select("id, kind, phrase, evidence, status")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <PageFrame
      title="Follow-up"
      description="Stop sequences, paste real messages, and set quiet hours. How drafts are written sits behind a door."
      breadcrumbs={advancedSettingsBreadcrumbs("Follow-up", "/app/settings/follow-up")}
    >
      <FollowUpSettingsScreen
        settings={settings}
        voice={voice}
        rules={rules}
        suggestions={(suggestions.data ?? []).map((row) => ({
          id: row.id,
          kind: row.kind,
          phrase: row.phrase,
          evidence:
            row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
              ? String((row.evidence as { text?: string }).text ?? "")
              : "",
          status: row.status,
        }))}
      />
    </PageFrame>
  );
}
