"use client";

import { useTransition } from "react";

import { switchOrg } from "@/lib/auth/actions";
import { useOrg } from "@/components/app/org-provider";
import { Select } from "@/components/ui/select";

/**
 * The sidebar's workspace line. Staff switch from the top bar. A customer who
 * owns more than one business picks between their own here: names only, no
 * status, nothing that hints at anyone else's workspace.
 */
export function OrgSwitcher() {
  const { org, memberships, isStaff } = useOrg();
  const [pending, startTransition] = useTransition();

  if (isStaff || memberships.length < 2) {
    return (
      <p
        className="truncate rounded-lg bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium text-sidebar-accent-foreground"
        title={org.name}
      >
        {org.name}
      </p>
    );
  }

  return (
    <Select
      aria-label="Your businesses"
      density="compact"
      className="w-full min-w-0"
      value={org.id}
      disabled={pending}
      onChange={(event) => {
        const orgId = event.target.value;
        startTransition(async () => {
          const result = await switchOrg(orgId);
          if (result.ok) window.location.assign(result.landing);
        });
      }}
    >
      {memberships.map((membership) => (
        <option key={membership.org.id} value={membership.org.id}>
          {membership.org.name}
        </option>
      ))}
    </Select>
  );
}
