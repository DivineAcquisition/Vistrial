import { redirect } from "next/navigation";

import { SetupWizard } from "@/app/(auth)/security/setup/wizard";
import { AuthCard } from "@/components/auth/auth-card";
import { getSessionUser } from "@/lib/auth/session";
import { safeInternalPath } from "@/lib/auth/paths";
import { staffDb } from "@/lib/staff/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Authenticator app" };

export default async function SecuritySetupPage({
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
    <AuthCard
      title="Authenticator app"
      subtitle="Scan the code, enter the six digits, then store the recovery codes. They are shown once."
      eyebrowLabel="Vistrial team"
      width="wide"
    >
      <SetupWizard next={next} already={self.enrolled} />
    </AuthCard>
  );
}
