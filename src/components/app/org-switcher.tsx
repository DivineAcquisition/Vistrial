"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { switchOrg } from "@/lib/auth/actions";
import { useOrg } from "@/components/app/org-provider";
import { Select } from "@/components/ui/select";

export function OrgSwitcher() {
  const { org, memberships } = useOrg();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (memberships.length < 2) {
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
      aria-label="Switch workspace"
      density="compact"
      className="w-full min-w-0"
      value={org.id}
      disabled={pending}
      onChange={(event) => {
        const orgId = event.target.value;
        startTransition(async () => {
          await switchOrg(orgId);
          router.refresh();
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
