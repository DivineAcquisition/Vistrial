import type { ReactNode } from "react";

import { SettingsNav } from "@/components/app/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsNav />
      {children}
    </>
  );
}
