import { PageFrame } from "@/components/app/page-frame";
import { LogOutcomeScreen } from "@/app/app/log/log-outcome-screen";
import { getAuthContext } from "@/lib/auth/session";
import { loadLogContext } from "@/lib/mobile/log-context";
import { createClient } from "@/lib/supabase/server";
import { throwIfForcedRouteError } from "@/lib/route-error";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || null;
}

export default async function LogOutcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  throwIfForcedRouteError(params.forceError);
  const ctx = await getAuthContext();
  const leadId = firstParam(params.leadId) ?? firstParam(params.lastLeadId);
  const from = firstParam(params.from) ?? (firstParam(params.nid) ? "notification" : null);
  const initial = await loadLogContext({ leadId, from });
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("org_members")
    .select("logged_outcome_from_mobile_at")
    .eq("id", ctx.member.id)
    .maybeSingle();

  const walkthrough = ctx.role === "setter" && !member?.logged_outcome_from_mobile_at;

  return (
    <PageFrame
      title="Log an outcome"
      description="One tap. Typing is optional. This is the input every other number depends on."
    >
      <LogOutcomeScreen initial={initial} from={from} walkthrough={Boolean(walkthrough)} />
    </PageFrame>
  );
}
