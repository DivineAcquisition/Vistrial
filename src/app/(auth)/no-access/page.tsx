import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { Button } from "@/components/ui/button";
import { getPlatformStaff, getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

type Reason = "staff_area" | "unassigned" | "none";

function readReason(value: string | string[] | undefined): Reason {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "staff_area" || raw === "unassigned" ? raw : "none";
}

const COPY: Record<Reason, { title: string; subtitle: string; eyebrow: string; detail: string }> = {
  staff_area: {
    title: "This address is for the Vistrial team",
    subtitle: "Your workspace is at app.vistrial.io.",
    eyebrow: "Wrong address",
    detail: "Nothing here is part of your account. Open your workspace to carry on.",
  },
  unassigned: {
    title: "No workspaces assigned yet",
    subtitle: "Your Vistrial team account is active, but no client workspace is assigned to you.",
    eyebrow: "Waiting on an assignment",
    detail: "A Platform Admin assigns workspaces. Once they do, the workspace appears here the next time you load a page.",
  },
  none: {
    title: "No workspace access",
    subtitle:
      "This account is signed in, but it is not an active member of a workspace. Ask an owner to send you an invite.",
    eyebrow: "Invite required",
    detail:
      "If you expected access, use the email address the invite was sent to. Signing out lets you try a different account.",
  },
};

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const reason = readReason((await searchParams).reason);
  if (reason === "none") {
    const memberships = await listActiveMemberships(user.id);
    if (memberships.length > 0) redirect("/app");
    if (await getPlatformStaff()) redirect("/no-access?reason=unassigned");
  }

  const copy = COPY[reason];
  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle} eyebrowLabel={copy.eyebrow}>
      <p className="mb-6 text-sm leading-relaxed text-dim">{copy.detail}</p>
      {reason === "staff_area" ? (
        <Button
          variant="primary"
          size="lg"
          className="mb-3 w-full rounded-xl"
          render={<a href={`${PRODUCTION_APP_ORIGIN}/app`} />}
        >
          Open your workspace
        </Button>
      ) : null}
      <SignOutForm>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="auth-alt w-full rounded-xl before:rounded-[calc(var(--radius-xl)-1px)]"
        >
          Sign out
        </Button>
      </SignOutForm>
    </AuthCard>
  );
}
