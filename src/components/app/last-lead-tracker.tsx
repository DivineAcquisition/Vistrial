"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { rememberOpenedLead } from "@/lib/mobile/last-lead";
import { markPushPromptEligible } from "@/components/app/push-prompt";
import { useOrg } from "@/components/app/org-provider";

const CASE = /^\/app\/cases\/([^/]+)/;

export function LastLeadTracker() {
  const pathname = usePathname();
  const { org } = useOrg();

  useEffect(() => {
    const match = pathname.match(CASE);
      if (match?.[1] && match[1] !== "brief") {
        rememberOpenedLead(org.id, match[1]);
        markPushPromptEligible();
      }
  }, [org.id, pathname]);

  return null;
}
