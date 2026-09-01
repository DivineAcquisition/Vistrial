"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { switchOrg } from "@/lib/auth/actions";
import { FORSIGHT_PATH } from "@/lib/navigation";

/**
 * Opens a workspace's Forsight by switching into it, rather than by inventing
 * a way to view one workspace from inside another. Every page then resolves
 * the workspace the way it always has, and nothing gains a cross-tenant read
 * path that a client could stumble into.
 *
 * Platform admins are enrolled as owner in every workspace by an existing
 * trigger, so the ordinary switcher already allows this.
 */
export function OpenWorkspace({ orgId, name }: { orgId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={`Open ${name}'s Forsight`}
      onClick={() =>
        startTransition(async () => {
          const result = await switchOrg(orgId);
          if (result.ok) {
            router.push(FORSIGHT_PATH);
            router.refresh();
          }
        })
      }
    >
      Open
    </Button>
  );
}
