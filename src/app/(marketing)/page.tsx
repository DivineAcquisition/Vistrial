import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { LandingPage } from "@/components/marketing/landing";
import { APP_NAME } from "@/lib/constants";
import { HERO, SITE_DESCRIPTION } from "@/lib/marketing/copy";
import { siteOrigin } from "@/lib/marketing/hosts";

export const metadata: Metadata = {
  title: {
    absolute: `${HERO.headline} · ${APP_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: siteOrigin(),
  },
  openGraph: {
    title: HERO.headline,
    description: SITE_DESCRIPTION,
    url: siteOrigin(),
    siteName: APP_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: HERO.headline,
    description: SITE_DESCRIPTION,
  },
};

export default function Home() {
  return (
    <MarketingShell>
      <LandingPage />
    </MarketingShell>
  );
}
