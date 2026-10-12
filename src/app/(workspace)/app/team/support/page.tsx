import Link from "next/link";

import { OnboardingTimingsForm } from "@/app/(workspace)/app/team/onboarding/settings-ui";
import { SupportForm } from "@/app/(workspace)/app/team/support/form";
import { PageFrame } from "@/components/app/page-frame";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { Panel } from "@/components/ui/panel";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  await requirePlatformAdmin();
  const db = await staffDb();
  const { data } = await db.from("staff_support_settings").select("*").eq("id", true).maybeSingle();
  if (!data) return null;
  return (
    <PageFrame
      title="Support"
      description="Business hours are Monday to Friday, 9 to 6 Eastern, until you change them. A request is flagged after the first target and raised to a Platform Admin after the second."
    >
      <SupportForm settings={data as Record<string, unknown>} />
      <section id="onboarding" aria-labelledby="onboarding-settings" className="scroll-mt-24">
        <Panel className="p-6">
          <h2 id="onboarding-settings" className={cardTitle}>
            Onboarding
          </h2>
          <p className={helperClass}>
            Reminders, when a setup counts as stuck, first-week check-ins, and how many full case files imported leads get. Stage wording and per-template
            defaults are on the{" "}
            <Link href="/app/team/onboarding/settings" className="text-brand-300 underline underline-offset-2">
              onboarding settings
            </Link>{" "}
            page.
          </p>
          <div className="mt-4">
            <OnboardingTimingsForm settings={data as Record<string, unknown>} />
          </div>
        </Panel>
      </section>
    </PageFrame>
  );
}
