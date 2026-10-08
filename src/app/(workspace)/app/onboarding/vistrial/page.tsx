import { FinishLaterButton } from "@/app/(workspace)/app/onboarding/finish-later";
import { StageRail } from "@/app/(workspace)/app/onboarding/stage-rail";
import { PageFrame } from "@/components/app/page-frame";
import { SalesOsOnboardingStep } from "@/components/sales-os/onboarding-step";
import { Notice } from "@/components/ui/states";
import { loadBusinessProfileState, requireProfileAccess } from "@/lib/profile/load";
import { PROFILE_STAGES } from "@/lib/profile/stages";
import { salesOsActor } from "@/lib/sales-os/session";
import { loadManagers, loadSalesOsSettings, salesOsConfigured } from "@/lib/sales-os/settings";

export default async function VistrialOnboardingPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const ctx = await requireProfileAccess();
  const actor = await salesOsActor();
  const [state, settings, managers, configured, query] = await Promise.all([
    loadBusinessProfileState(ctx.org.id),
    loadSalesOsSettings(actor),
    loadManagers(actor),
    salesOsConfigured(actor),
    searchParams,
  ]);
  return (
    <PageFrame
      eyebrow={`Stage ${PROFILE_STAGES.length + 1} of ${PROFILE_STAGES.length + 1}`}
      title="What Vistrial may do for you"
      description="Vistrial can post updates to your team's Slack or Discord and keep scripts in your Google Drive. Choose what it does on its own and what waits for your OK."
      secondaryActions={<FinishLaterButton />}
    >
      <StageRail current="vistrial" stages={state.stages} vistrialDone={configured} />
      {query.drive === "connected" ? <Notice tone="success">Google Drive is connected.</Notice> : null}
      {query.drive && query.drive !== "connected" ? (
        <Notice tone="warning">Google Drive wasn&apos;t connected. You can try again or do it later in Settings.</Notice>
      ) : null}
      <SalesOsOnboardingStep settings={settings} managers={managers} />
    </PageFrame>
  );
}
