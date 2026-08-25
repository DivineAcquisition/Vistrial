import type { ReactNode } from "react";

import { AdvancedNav } from "@/components/app/advanced-nav";
import { TakeOverForm } from "@/app/app/settings/advanced/take-over-form";
import { SettingsDirtyRoot } from "@/components/app/unsaved-changes-guard";
import { Notice } from "@/components/ui/states";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { canWriteAdvancedSettings, isOwner } from "@/lib/settings/managed";
import { ADVANCED_ENTRY_PLAIN, MANAGED_ADVANCED_PLAIN } from "@/lib/settings/constants";
import { loadOrgManaged } from "@/lib/settings/org";
import { helperClass } from "@/lib/ui";

export default async function AdvancedSettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgSettingsManager();
  const managed = await loadOrgManaged(ctx.org.id);
  const writable = canWriteAdvancedSettings(ctx, managed.managed);
  const showTakeover = managed.managed && isOwner(ctx) && !ctx.isPlatformAdmin;

  return (
    <SettingsDirtyRoot>
      <p className={`${helperClass} mb-4`}>{ADVANCED_ENTRY_PLAIN}</p>
      {managed.managed && !writable ? (
        <Notice tone="info" className="mb-6" title="Managed by your install team">
          {MANAGED_ADVANCED_PLAIN}
        </Notice>
      ) : null}
      {showTakeover ? (
        <div className="mb-6">
          <TakeOverForm />
        </div>
      ) : null}
      <AdvancedNav />
      {children}
    </SettingsDirtyRoot>
  );
}
