import type { Metadata } from "next";

import { AuthScreen } from "@/components/auth/auth-screen";
import { safeAppPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = safeAppPath(params.redirect_url, "/app");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <AuthScreen mode="sign-up" redirectTo={redirectTo} />
    </main>
  );
}
