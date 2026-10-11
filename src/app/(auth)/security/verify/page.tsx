import Link from "next/link";
import { redirect } from "next/navigation";

import { VerifyForm } from "@/app/(auth)/security/verify/form";
import { AuthCard } from "@/components/auth/auth-card";
import { safeInternalPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { staffDb } from "@/lib/staff/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Confirm it is you" };

export default async function SecurityVerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const next = safeInternalPath(typeof params.next === "string" ? params.next : "/app/team", "/app/team");
  const db = await staffDb();
  const { data } = await db.rpc("staff_mfa_status");
  const self = ((data ?? []) as Array<{ user_id: string; enrolled: boolean }>).find((row) => row.user_id === user.id);
  if (!self) redirect("/no-access");
  return (
    <AuthCard title="Confirm it is you" subtitle="Sensitive actions need a check from the last 15 minutes." eyebrowLabel="Vistrial team">
      <VerifyForm next={next} enrolled={self.enrolled} />
      <Link href={`/security/recover?next=${encodeURIComponent(next)}`} className="mt-4 block text-sm text-brand-300 underline">
        Use a recovery code
      </Link>
    </AuthCard>
  );
}
