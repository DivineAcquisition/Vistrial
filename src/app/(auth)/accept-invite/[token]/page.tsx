import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm } from "@/app/(auth)/accept-invite/[token]/accept-invite-form";
import { InstallSteps } from "@/components/app/install-steps";
import { PENDING_INVITE_COOKIE, pendingInviteCookieOptions } from "@/lib/auth/cookies";
import { emailsMatch } from "@/lib/auth/permissions";
import { lookupInviteByToken } from "@/lib/auth/invites";
import { getSessionUser } from "@/lib/auth/session";
import { helperClass } from "@/lib/ui";

const REDEEM_ERRORS: Record<string, { title: string; subtitle: string }> = {
  email_mismatch: {
    title: "Wrong account",
    subtitle: "This invite belongs to a different email than the one you are signed in with.",
  },
  already_accepted: {
    title: "Invite already used",
    subtitle: "This invite has already been accepted. Sign in with the account that joined.",
  },
  expired: {
    title: "Invite expired",
    subtitle: "This invite is no longer valid. Ask an owner to send a new one.",
  },
  not_found: {
    title: "Invite not found",
    subtitle: "This link is not valid. Ask an owner to send a new invite.",
  },
};

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await lookupInviteByToken(token);

  if (invite.status === "missing") {
    return (
      <AuthCard title="Invite not found" subtitle="This link is not valid. Ask an owner to send a new invite." />
    );
  }

  if (invite.status === "expired") {
    return (
      <AuthCard
        title="Invite expired"
        subtitle="This invite is no longer valid. Ask an owner to send a new one."
      />
    );
  }

  if (invite.status === "accepted") {
    return (
      <AuthCard
        title="Invite already used"
        subtitle="This invite has already been accepted. Sign in with the account that joined."
      />
    );
  }

  const user = await getSessionUser();

  if (error && REDEEM_ERRORS[error]) {
    const copy = REDEEM_ERRORS[error];
    return (
      <AuthCard title={copy.title} subtitle={copy.subtitle} eyebrowLabel={invite.orgName}>
        {error === "email_mismatch" ? (
          <>
            <p className={helperClass}>
              Signed in as {user?.email ?? "a different address"}. The invite is for {invite.email}.
              It is not attached to this account.
            </p>
            <a href="/auth/signout" className="mt-6 block text-center text-sm text-brand-300 hover:text-white">
              Sign out
            </a>
          </>
        ) : null}
      </AuthCard>
    );
  }

  if (user) {
    if (!emailsMatch(user.email, invite.email)) {
      return (
        <AuthCard
          title="Wrong account"
          subtitle={`This invite is for ${invite.email}. You are signed in as ${user.email ?? "a different address"}. Sign out and use the invited email.`}
          eyebrowLabel={invite.orgName}
        >
          <p className={helperClass}>
            The invite is not attached to this account. That is intentional — a mismatched sign-in cannot join the workspace.
          </p>
          <a href="/auth/signout" className="mt-6 block text-center text-sm text-brand-300 hover:text-white">
            Sign out
          </a>
        </AuthCard>
      );
    }

    redirect(`/auth/redeem-invite?token=${encodeURIComponent(token)}`);
  }

  const cookieStore = await cookies();
  try {
    cookieStore.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions);
  } catch {
    // Form actions also set the pending-invite cookie before sign-in.
  }

  return (
    <AuthCard
      title={`Join ${invite.orgName}`}
      subtitle={`This invite is for ${invite.email}. Sign in or create an account with that address.`}
      eyebrowLabel="Invitation"
    >
      <AcceptInviteForm token={token} email={invite.email} role={invite.role} />
      <div className="mt-8 border-t border-white/10 pt-6">
        <p className="text-sm font-medium text-white">Install on your phone after you join</p>
        <div className="mt-3">
          <InstallSteps />
        </div>
      </div>
    </AuthCard>
  );
}
