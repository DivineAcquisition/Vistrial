import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { btnSecondary, btnSizeMd } from "@/lib/ui";

export default async function NoAccessPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(user.id);
  if (memberships.length > 0) {
    redirect("/app/queue");
  }

  return (
    <AuthCard
      title="No workspace access"
      subtitle="This account is signed in, but it is not an active member of a workspace. Ask an owner to send you an invite."
      eyebrowLabel="Invite required"
    >
      <p className="mb-6 text-sm leading-relaxed text-dim">
        If you expected access, use the email address the invite was sent to. Signing out lets you try a different account.
      </p>
      <Link href="/auth/signout" className={`${btnSecondary} ${btnSizeMd} w-full rounded-none`}>
        Sign out
      </Link>
    </AuthCard>
  );
}
