import { headers } from "next/headers";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { MarketingShell } from "@/components/marketing/chrome";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth/session";
import { NOT_FOUND } from "@/lib/marketing/content";
import { classifyProductHost } from "@/lib/marketing/hosts";
import { landingPath } from "@/lib/navigation";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const path = headerStore.get("x-vistrial-pathname") ?? "";
  const product = classifyProductHost(host);
  const publicPage =
    product === "site" ||
    product === "unknown" ||
    (product === "local" && !path.startsWith("/app") && !path.startsWith("/login") && !path.startsWith("/stellar") && !path.startsWith("/portal"));
  if (publicPage) {
    return (
      <MarketingShell headerAction="none">
        <section className="mx-auto max-w-xl px-5 py-20">
          <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>{NOT_FOUND.title}</h1>
          <p className={`${marketingSubhead} mt-4`}>{NOT_FOUND.body}</p>
          <p className="mt-8">
            <Link href="/" className="text-sm font-medium text-brand-300 underline">{NOT_FOUND.cta}</Link>
          </p>
        </section>
      </MarketingShell>
    );
  }
  const ctx = await getAuthContext();
  const home = landingPath(ctx.member.surfaceAccess, ctx.role);
  return (
    <AuthCard title="Not found" subtitle="That page is not available.">
      <Button variant="secondary" size="lg" className="w-full rounded-xl" render={<Link href={home} />}>
        Back home
      </Button>
    </AuthCard>
  );
}
