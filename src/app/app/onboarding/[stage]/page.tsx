import { notFound } from "next/navigation";

import { ConnectStage } from "@/app/app/onboarding/connect-stage";
import { StagePayoff } from "@/app/app/onboarding/payoffs";
import { StageForm } from "@/app/app/onboarding/stage-forms";
import { StageRail } from "@/app/app/onboarding/stage-rail";
import { VoiceExamples } from "@/app/app/onboarding/voice-examples";
import { PageFrame } from "@/components/app/page-frame";
import { MAX_VOICE_EXAMPLES, MIN_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { parseVoiceExamples } from "@/lib/follow-up/voice";
import { ghlOAuthConfigured } from "@/lib/ghl/env";
import {
  loadBusinessProfileState,
  loadOnboardingPayoff,
  loadProfileDefaults,
  requireProfileAccess,
} from "@/lib/profile/load";
import { STAGE_META, isProfileStage } from "@/lib/profile/stages";
import { createClient } from "@/lib/supabase/server";

const CONNECT_ERRORS: Record<string, string> = {
  location_claimed: "That GoHighLevel location is already linked to another workspace.",
  oauth_denied: "The GoHighLevel authorization was cancelled.",
  oauth_invalid: "The connection attempt was invalid. Start it again from here.",
  oauth_expired: "The connection attempt expired. Start it again from here.",
  oauth_no_location: "GoHighLevel did not return a location to link.",
  oauth_failed: "The GoHighLevel connection could not be completed.",
};

export default async function OnboardingStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<{ done?: string; ghl_error?: string }>;
}) {
  const { stage: stageParam } = await params;
  if (!isProfileStage(stageParam)) notFound();
  const stage = stageParam;

  const ctx = await requireProfileAccess();
  const query = await searchParams;
  const showPayoff = query.done === "1";

  const [state, defaults] = await Promise.all([
    loadBusinessProfileState(ctx.org.id),
    loadProfileDefaults(ctx.org.id),
  ]);

  const meta = STAGE_META[stage];

  let body: React.ReactNode;

  if (showPayoff) {
    const payoff = await loadOnboardingPayoff(ctx.org.id, stage);
    body = <StagePayoff orgId={ctx.org.id} stage={stage} payoff={payoff} />;
  } else if (stage === "connect") {
    const supabase = await createClient();
    const { data: connection } = await supabase
      .from("ghl_connections")
      .select("status, location_name")
      .eq("org_id", ctx.org.id)
      .maybeSingle();
    body = (
      <ConnectStage
        status={connection?.status ?? "missing"}
        locationName={connection?.location_name ?? null}
        oauthConfigured={ghlOAuthConfigured()}
        flashError={query.ghl_error ? (CONNECT_ERRORS[query.ghl_error] ?? CONNECT_ERRORS.oauth_failed) : null}
      />
    );
  } else if (stage === "voice") {
    const supabase = await createClient();
    const { data: voice } = await supabase
      .from("org_voice_profiles")
      .select("examples")
      .eq("org_id", ctx.org.id)
      .maybeSingle();
    body = (
      <div className="space-y-6">
        <VoiceExamples
          examples={parseVoiceExamples(voice?.examples).map((example) => ({
            body: example.body,
            channel: example.channel,
            addedAt: example.addedAt,
          }))}
          minimum={MIN_VOICE_EXAMPLES}
          maximum={MAX_VOICE_EXAMPLES}
        />
        <StageForm stage={stage} defaults={defaults} />
      </div>
    );
  } else {
    body = <StageForm stage={stage} defaults={defaults} />;
  }

  return (
    <PageFrame
      title={meta.title}
      description={
        showPayoff
          ? meta.payoff
          : "Everything is pre-filled. Correcting is the job; you should not have to compose anything."
      }
    >
      <StageRail current={stage} stages={state.stages} />
      {body}
    </PageFrame>
  );
}
