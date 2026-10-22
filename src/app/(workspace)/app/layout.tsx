import Link from "next/link";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CoachingDisclosureNotice } from "@/components/app/coaching-disclosure";
import { MobileWalkthroughNotice } from "@/components/app/mobile-walkthrough";
import { RoleWelcome } from "@/components/app/role-welcome";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROLE_WELCOME } from "@/lib/first-run";
import { getAuthContext } from "@/lib/auth/session";
import { MEMBER_LIMIT_MESSAGE } from "@/lib/billing/copy";
import { redirectIfOnboardingIncomplete } from "@/lib/onboarding/gate";
import { isProductScopeEnabled } from "@/lib/product-scope";
import { createClient } from "@/lib/supabase/server";
import { agenticHomeEnabled } from "@/lib/workspace/home-state";
import { isAgenticSurface } from "@/lib/workspace/state";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  await redirectIfOnboardingIncomplete();
  const supabase = await createClient();
  const welcomeRole = !ctx.isStaff && (ctx.workspaceRole === "member" || ctx.workspaceRole === "operator") ? ctx.workspaceRole : null;
  const [{ data: training }, { data: welcome }] = await Promise.all([
    supabase
      .from("org_members")
      .select("logged_outcome_from_mobile_at, call_coaching_acknowledged_at")
      .eq("id", ctx.member.id)
      .maybeSingle(),
    welcomeRole
      ? (supabase as unknown as SupabaseClient)
          .from("onboarding_member_flags")
          .select("welcome_seen_at")
          .eq("org_id", ctx.org.id)
          .eq("member_id", ctx.member.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const showWelcome = welcomeRole !== null && !(welcome as { welcome_seen_at?: string | null } | null)?.welcome_seen_at;
  const path = (await headers()).get("x-vistrial-pathname") ?? "";
  const agenticSurface = isAgenticSurface(path.split("?")[0] ?? path) && (await agenticHomeEnabled(ctx).catch(() => false));
  const billing = ctx.isStaff
    ? null
    : ((
        await (supabase as unknown as { rpc: (name: string, args: { p_org_id: string }) => Promise<{ data: { state?: string } | null }> }).rpc(
          "billing_notice",
          { p_org_id: ctx.org.id }
        )
      ).data);
  const held = billing?.state === "suspended" || billing?.state === "canceled";
  const billingPath =
    path.startsWith("/app/settings/billing") || path.startsWith("/app/settings/privacy") || path.startsWith("/app/help");
  const ownerHeld = held && ctx.workspaceRole === "owner" && !billingPath;

  const { data: legalDue } = await (supabase as unknown as SupabaseClient).rpc("legal_acceptance_due");
  return (
    <>
      {legalDue === true ? (
        <form action={async () => {
          "use server";
          const { createClient: client } = await import("@/lib/supabase/server");
          const db = (await client()) as unknown as SupabaseClient;
          await db.rpc("accept_legal_versions");
        }} className="border-b border-overlay/10 bg-overlay/[0.03] px-4 py-3 text-sm text-strong">
          <p>
            The current <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/terms" className="underline">Terms</Link> have a new approved version. Accept them to keep going.
          </p>
          <button type="submit" className="mt-2 text-brand-300 underline">I accept the current Privacy and Terms</button>
        </form>
      ) : null}
      {billing?.state === "restricted" && !agenticSurface ? (
        <Alert variant="warning">
          <AlertTitle>Some automation is paused</AlertTitle>
          <AlertDescription>
            New drafts, new AI case files, Compass, and new transcription wait until billing is sorted. You can still read your leads.
            {ctx.workspaceRole === "owner" ? " Open Billing to update the payment method." : ` ${MEMBER_LIMIT_MESSAGE}`}
          </AlertDescription>
        </Alert>
      ) : null}
      {billing?.state === "past_due" && ctx.workspaceRole === "owner" && !agenticSurface ? (
        <Alert variant="warning">
          <AlertTitle>A payment did not go through</AlertTitle>
          <AlertDescription>Everything keeps working for now. Open Billing to update the payment method.</AlertDescription>
        </Alert>
      ) : null}
      {showWelcome && welcomeRole ? <RoleWelcome copy={ROLE_WELCOME[welcomeRole]} /> : null}
      {isProductScopeEnabled("coaching") ? (
        <CoachingDisclosureNotice needed={!training?.call_coaching_acknowledged_at} />
      ) : null}
      <MobileWalkthroughNotice
        needed={(ctx.role === "setter" || ctx.role === "operator") && !training?.logged_outcome_from_mobile_at}
      />
      {ownerHeld ? (
        <Alert variant="warning">
          <AlertTitle>This workspace is paused</AlertTitle>
          <AlertDescription>
            You can still open Billing to pay or cancel, and Privacy to export your data. Nothing is deleted from here.
          </AlertDescription>
        </Alert>
      ) : held && ctx.workspaceRole !== "owner" ? (
        <Alert>
          <AlertTitle>This workspace is paused</AlertTitle>
          <AlertDescription>{MEMBER_LIMIT_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        children
      )}
    </>
  );
}
