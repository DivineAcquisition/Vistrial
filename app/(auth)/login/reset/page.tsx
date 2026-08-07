import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetRequestForm } from "@/components/auth/reset-request-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Reset password — ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function ResetRequestPage() {
  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter your team email. We always show the same confirmation next."
    >
      <ResetRequestForm />
      <p className="mt-4 text-center text-xs text-dim">
        <Link
          href="/login"
          className="text-brand-300 transition-colors hover:text-brand-200"
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
