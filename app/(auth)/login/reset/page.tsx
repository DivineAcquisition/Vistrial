import type { Metadata } from "next";
import Link from "next/link";

import { ResetRequestForm } from "@/components/auth/reset-request-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Reset password — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function ResetRequestPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-[380px] rounded-2xl px-7 py-8">
        <p className="text-center text-lg font-semibold tracking-[0.25em] text-brand-500 uppercase">
          {APP_NAME}
        </p>
        <h1 className="mt-4 text-center text-base font-semibold text-white">
          Reset password
        </h1>
        <p className="mt-2 text-center text-xs text-dim">
          Enter your team email. We always show the same confirmation next.
        </p>
        <ResetRequestForm />
        <p className="mt-4 text-center text-xs text-dim">
          <Link href="/login" className="text-brand-500 hover:text-brand-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
