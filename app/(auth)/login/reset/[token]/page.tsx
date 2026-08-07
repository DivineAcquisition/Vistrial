import type { Metadata } from "next";

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
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-[380px] rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <h1 className="mt-4 text-center text-base font-semibold text-white">
          Choose a new password
        </h1>
        <p className="mt-2 text-center text-xs text-dim">
          This link works once. Using it signs you out of every other session.
        </p>
        <ResetCompleteForm token={token} />
      </div>
    </main>
  );
}
