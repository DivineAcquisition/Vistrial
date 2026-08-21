import { PageFrame } from "@/components/app/page-frame";
import { FollowUpSettingsScreen } from "@/app/app/settings/follow-up/follow-up-settings";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { loadFollowUpSettings, loadRoutingRules, loadVoiceProfile } from "@/lib/follow-up/load";
import { createClient } from "@/lib/supabase/server";

export default async function FollowUpSettingsPage() {
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
      description="Voice, routing, quiet hours, and the org-wide sequence stop. Vistrial drafts; a person still has to approve."
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
