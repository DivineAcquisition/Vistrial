"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const ShellSwitchContext = createContext<{
  switching: boolean;
  beginSwitch: () => void;
  cancelSwitch: () => void;
}>({ switching: false, beginSwitch: () => {}, cancelSwitch: () => {} });

/**
 * Hides the current page the moment a workspace change starts, and keeps it
 * hidden until the next route is ready. The layout does not remount, so the
 * flag clears when the path changes.
 */
export function ShellSwitchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lockedPath, setLockedPath] = useState<string | null>(null);
  const switching = lockedPath !== null && lockedPath === pathname;

  const beginSwitch = useCallback(() => setLockedPath(pathname), [pathname]);
  const cancelSwitch = useCallback(() => setLockedPath(null), []);

  return (
    <ShellSwitchContext.Provider value={{ switching, beginSwitch, cancelSwitch }}>
      {children}
    </ShellSwitchContext.Provider>
  );
}

export function useShellSwitch() {
  return useContext(ShellSwitchContext);
}
