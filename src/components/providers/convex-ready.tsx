"use client";

import { createContext, useContext } from "react";

const ConvexReadyContext = createContext(false);

export function ConvexReadyProvider({ children }: { children: React.ReactNode }) {
  return <ConvexReadyContext.Provider value={true}>{children}</ConvexReadyContext.Provider>;
}

export function useConvexReady() {
  return useContext(ConvexReadyContext);
}
