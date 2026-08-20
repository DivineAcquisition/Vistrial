"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import { persistActiveOrg } from "@/lib/auth/actions";
import type { ClientOrgState } from "@/lib/auth/types";

const OrgContext = createContext<ClientOrgState | null>(null);

export function OrgProvider({
  value,
  children,
}: {
  value: ClientOrgState;
  children: ReactNode;
}) {
  useEffect(() => {
    if (value.cookieNeedsReset) {
      void persistActiveOrg(value.org.id);
    }
  }, [value.cookieNeedsReset, value.org.id]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("vistrial-active-org");
    channel.onmessage = (event: MessageEvent<{ orgId?: string }>) => {
      if (typeof event.data?.orgId === "string" && event.data.orgId !== value.org.id) {
        window.location.reload();
      }
    };
    channel.postMessage({ orgId: value.org.id });
    return () => channel.close();
  }, [value.org.id]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): ClientOrgState {
  const value = useContext(OrgContext);
  if (!value) {
    throw new Error("useOrg must be used inside OrgProvider");
  }
  return value;
}
