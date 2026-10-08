import { requirePortalAccess } from "@/lib/portal/access";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess();
  return children;
}
