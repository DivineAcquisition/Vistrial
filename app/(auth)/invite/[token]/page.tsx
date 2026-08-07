import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm } from "@/components/portal/accept-invite-form";
import { getClientUserByInviteHash } from "@/lib/db/portal";
import { getClient } from "@/lib/db/clients";
import { APP_NAME, APP_OWNER } from "@/lib/constants";
import { hashToken } from "@/lib/portal/tokens";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: `Accept invitation — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const membership = await getClientUserByInviteHash(hashToken(token));
  if (!membership) notFound();

  if (
    membership.invitation_expires_at !== null &&
    Date.parse(membership.invitation_expires_at) <= Date.now()
  ) {
    return (
      <AuthCard
        eyebrowLabel={`${APP_OWNER} · Client portal`}
        title="This invitation has expired"
        subtitle="Ask Divine Acquisition to send a new one. There is no public signup."
      >
        <p className="text-center text-sm text-dim">
          Invitations last seven days and can only be used once.
        </p>
      </AuthCard>
    );
  }

  const client = await getClient(membership.client_id);

  return (
    <AuthCard
      eyebrowLabel={`${APP_OWNER} · Client portal`}
      title={`Join the ${client?.name ?? "client"} portal`}
      subtitle={`Invited as ${membership.email}${
        membership.invitation_expires_at
          ? ` · expires ${formatDateTime(membership.invitation_expires_at)}`
          : ""
      }`}
    >
      <AcceptInviteForm token={token} />
    </AuthCard>
  );
}
