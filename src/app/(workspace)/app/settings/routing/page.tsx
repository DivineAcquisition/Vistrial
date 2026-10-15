import { PageFrame } from "@/components/app/page-frame";
import { RoutingForm } from "@/app/(workspace)/app/settings/routing/form";
import { getAuthContext } from "@/lib/auth/session";
import { canSeePeople } from "@/lib/auth/portal-access";
import { notFound } from "next/navigation";

export const metadata = { title: "Routing" };

export default async function RoutingPage() {
  const ctx = await getAuthContext();
  if (!canSeePeople(ctx) && !ctx.isStaff) notFound();
  return (
    <PageFrame
      title="Routing"
      description="How new leads reach the team. Historic imports stay unassigned. A repeated arrival does not assign twice."
    >
      <RoutingForm staff={ctx.isStaff} />
    </PageFrame>
  );
}
