"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const DirtyContext = createContext<{
  dirty: boolean;
  setDirty: (next: boolean) => void;
} | null>(null);

export function useSettingsDirty() {
  return useContext(DirtyContext);
}

export function SettingsDirtyRoot({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a");
      if (!link || link.target === "_blank" || link.getAttribute("download") !== null) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("You have unsaved changes. Leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        setDirty(false);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  return (
    <DirtyContext.Provider value={{ dirty, setDirty }}>
      <div
        onChange={() => setDirty(true)}
        onSubmit={() => setDirty(false)}
      >
        {children}
      </div>
    </DirtyContext.Provider>
  );
}
