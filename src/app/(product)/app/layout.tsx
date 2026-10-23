import type { Metadata } from "next";

import { ProductShell } from "@/components/shell/product-shell";
import { loadCatalog } from "@/lib/shell/load-catalog";

export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const agents = await loadCatalog();
  return <ProductShell agents={agents}>{children}</ProductShell>;
}
