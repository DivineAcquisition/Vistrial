"use client";

import { useEffect } from "react";

import { trackMetaLead } from "@/components/marketing/tracking-scripts";
import { categoryAllowed, globalPrivacyControlOn, readConsentCookie } from "@/lib/marketing/consent";

/** Fires one Lead event with no personal data, and only when advertising was accepted. */
export function LeadEvent() {
  useEffect(() => {
    const choice = readConsentCookie();
    if (!categoryAllowed({ choice, category: "advertising", gpc: globalPrivacyControlOn(), version: choice?.v ?? 1 })) return;
    trackMetaLead();
  }, []);
  return null;
}