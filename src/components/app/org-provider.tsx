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

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): ClientOrgState {
  const value = useContext(OrgContext);
  if (!value) {
    throw new Error("useOrg must be used inside OrgProvider");
  }
  return value;
}
