import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { OpenConsentButton } from "@/components/marketing/consent-banner";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";
import { helperClass } from "@/lib/ui";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy and cookies" };

export default async function CookieSettingsPage() {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db
    .from("legal_acceptances")
    .select("document, version_on, accepted_at")
    .eq("user_id", ctx.user.id)
    .order("accepted_at", { ascending: false });
  const rows = (data ?? []) as Array<{ document: string; version_on: string; accepted_at: string }>;
  return (
    <PageFrame title="Privacy and cookies" description="Choices for this browser, and the notices that belong to your account.">
      <Panel className="space-y-3 p-6">
        <h2 className="text-white">Cookies</h2>
        <p className={helperClass}>
          The signed-in application uses essential cookies only: the sign-in session, the open workspace, and display choices such as the sidebar. It does not load Google Analytics or the Meta pixel.
        </p>
        <p className={helperClass}>Choices about the public website are stored in this browser, not on your account.</p>
        <OpenConsentButton label="Open cookie preferences for this browser" />
        <p className={helperClass}>
          <Link href="/cookies" className="text-brand-300 underline">Read the cookie page</Link>
        </p>
      </Panel>
      <Panel className="mt-4 space-y-3 p-6">
        <h2 className="text-white">Email and notifications</h2>
        <p className={helperClass}>
          Account, security, and billing notices cannot be turned off. Setup tips can be stopped from the unsubscribe link in those emails. Other notification choices are on the notifications page.
        </p>
        <Link href="/app/settings/notifications" className="text-sm text-brand-300 underline">Notification preferences</Link>
      </Panel>
      <Panel className="mt-4 space-y-3 p-6">
        <h2 className="text-white">Legal documents</h2>
        {rows.length === 0 ? <p className={helperClass}>No acceptance is recorded for this account yet.</p> : (
          <ul className={`${helperClass} space-y-1`}>
            {rows.map((row) => (
              <li key={`${row.document}-${row.version_on}`}>
                {row.document} version {row.version_on}, accepted {row.accepted_at.slice(0, 10)}.{" "}
                <Link href={row.document === "terms" ? "/terms" : "/privacy"} className="text-brand-300 underline">Read</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="mt-4 space-y-3 p-6">
        <h2 className="text-white">Your data</h2>
        {ctx.workspaceRole === "owner" || ctx.isStaff ? (
          <Link href="/app/settings/privacy" className="text-sm text-brand-300 underline">Data requests</Link>
        ) : (
          <p className={helperClass}>Ask a workspace Owner to export or delete workspace data. You can also email contact@vistrial.io.</p>
        )}
        <p className={helperClass}>
          <Link href="/privacy#your-choices" className="text-brand-300 underline">Privacy Policy, your choices</Link>
        </p>
      </Panel>
    </PageFrame>
  );
}
