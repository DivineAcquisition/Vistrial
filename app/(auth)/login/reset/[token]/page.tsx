import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetCompleteForm } from "@/components/auth/reset-complete-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Choose a new password — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function ResetCompletePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="This link works once. Using it signs you out of every other session."
    >
      <ResetCompleteForm token={token} />
    </AuthCard>
  );
}
