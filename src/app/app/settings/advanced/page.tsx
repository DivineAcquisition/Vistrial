import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { ADVANCED_SETTINGS_PAGES } from "@/lib/navigation";
import { btnSecondary, btnSizeSm, cardTitle, helperClass } from "@/lib/ui";

export default async function AdvancedSettingsPage() {
  await requireOrgSettingsManager();

  return (
    <PageFrame
      title="Advanced"
      description="Scoring, follow-up, integrations, and export. These stay off the main tabs so day-to-day settings stay small."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {ADVANCED_SETTINGS_PAGES.map((page) => (
          <Panel key={page.href} className="p-6">
            <h2 className={cardTitle}>{page.label}</h2>
            <p className={`mt-2 ${helperClass}`}>{page.description}</p>
            <div className="mt-5">
              <Link href={page.href} className={`${btnSecondary} ${btnSizeSm}`}>
                Open {page.label.toLowerCase()}
              </Link>
            </div>
          </Panel>
        ))}
      </div>
    </PageFrame>
  );
}
