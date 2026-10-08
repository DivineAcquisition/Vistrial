"use client";

import { OrgSwitcher } from "@/components/app/org-switcher";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { useOrg } from "@/components/app/org-provider";

/** Staff get the workspace switcher. A customer sees their own business name. */
export function ShellLeading() {
  const { org, isStaff, memberships } = useOrg();
  if (isStaff) return <WorkspaceSwitcher />;
  if (memberships.length > 1) return <OrgSwitcher />;
  return (
    <p className="max-w-[7rem] truncate text-sm text-muted-foreground sm:max-w-[16rem]" title={org.name}>
      {org.name}
    </p>
  );
}
