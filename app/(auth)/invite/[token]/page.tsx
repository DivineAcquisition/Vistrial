import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel w-full max-w-[420px] rounded-2xl px-7 py-8 text-center">
          <p className="text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
            {APP_NAME}
          </p>
          <h1 className="mt-4 text-xl font-semibold text-white">
            This invitation has expired
          </h1>
          <p className="mt-2 text-sm text-silver">
            Ask Divine Acquisition to send a new one. There is no public signup.
          </p>
        </div>
      </main>
    );
  }

  const client = await getClient(membership.client_id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-[420px] rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <p className="mt-1.5 text-center text-xs text-dim">{APP_OWNER}</p>

        <h1 className="mt-6 text-center text-xl font-semibold text-white">
          Join the {client?.name ?? "client"} portal
        </h1>
        <p className="mt-2 text-center text-sm text-silver">
          Invited as {membership.email}
          {membership.invitation_expires_at
            ? ` · expires ${formatDateTime(membership.invitation_expires_at)}`
            : null}
        </p>

        <AcceptInviteForm token={token} />
      </div>
    </main>
  );
}
