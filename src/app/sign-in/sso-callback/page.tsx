import type { Metadata } from "next";

import { SsoCallback } from "@/components/auth/sso-callback";
import { safeAppPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Finishing sign-in",
  robots: { index: false, follow: false },
};

/** Google sends the browser back here. The page finishes the sign-in and moves on. */
export default async function SsoCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; from?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = safeAppPath(params.redirect_url, "/app");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full">
        <SsoCallback redirectTo={redirectTo} from={params.from === "sign-up" ? "sign-up" : "sign-in"} />
      </div>
    </main>
  );
}
