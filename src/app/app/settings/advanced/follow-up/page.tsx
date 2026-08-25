import { PageFrame } from "@/components/app/page-frame";
import { FollowUpSettingsScreen } from "@/app/app/settings/follow-up/follow-up-settings";
import { AdvancedWriteLock } from "@/components/app/advanced-write-lock";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { loadFollowUpSettings, loadRoutingRules, loadVoiceProfile } from "@/lib/follow-up/load";
import { loadAdvancedAccess } from "@/lib/settings/org";
import { createClient } from "@/lib/supabase/server";

export default async function AdvancedFollowUpPage() {
  const ctx = await requireOrgSettingsManager();
  const access = await loadAdvancedAccess(ctx);
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
      title="Follow-up mechanics"
      description="Branch configuration, sequence timing, maximum length and duration, and quiet hours."
    >
      <AdvancedWriteLock locked={!access.writable}>
      <FollowUpSettingsScreen
        surface="advanced"
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
      </AdvancedWriteLock>
    </PageFrame>
  );
}
