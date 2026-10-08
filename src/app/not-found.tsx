import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth/session";
import { landingPath } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const ctx = await getAuthContext();
  const home = landingPath(ctx.member.surfaceAccess, ctx.role);
  return (
    <AuthCard title="Not found" subtitle="That page is not available.">
      <Button variant="secondary" size="lg" className="w-full rounded-xl" render={<Link href={home} />}>
        Back home
      </Button>
    </AuthCard>
  );
}
