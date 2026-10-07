"use client";

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
 * Staff hold a seat in every workspace they can enter (all of them for a
 * Platform Admin, assigned ones for the Service Team), so the ordinary
 * switcher already allows this. A full page load leaves nothing from the
 * previous workspace on screen.
 */
export function OpenWorkspace({ orgId, name }: { orgId: string; name: string }) {
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
            window.location.assign(FORSIGHT_PATH);
          }
        })
      }
    >
      Open
    </Button>
  );
}
