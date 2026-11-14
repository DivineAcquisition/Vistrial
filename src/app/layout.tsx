import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { InlineScript } from "@/components/app/inline-script";
import { ThemeSync } from "@/components/app/theme-toggle";
import { AppProviders } from "@/components/providers/app-providers";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, LEGAL_ENTITY, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";
import { geistMono, interDisplay } from "@/lib/fonts";
import { HERO, SITE_DESCRIPTION, SOCIAL_IMAGE } from "@/lib/marketing/copy";
import { isClerkHost } from "@/lib/marketing/hosts";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";
import { cn } from "@/lib/utils";
import { ErrorNavigator } from "@/components/errors/error-navigator";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_SITE_ORIGIN),
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  // Icons come from Next's file conventions: app/favicon.ico, app/icon1.png, app/icon2.png and
  // app/apple-icon.png, drawn by scripts/generate-icons.mjs.
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: LEGAL_ENTITY }],
  publisher: LEGAL_ENTITY,
  // Public pages are indexable unless they say otherwise; the app, sign-in and drafts say otherwise.
  robots: { index: true, follow: true },
  openGraph: {
    siteName: APP_NAME,
    locale: "en_US",
    type: "website",
    title: HERO.headline,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HERO.headline,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE.url],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR.light,
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const clerk = isClerkHost(headerList.get("x-forwarded-host") ?? headerList.get("host"));
  return (
    // The head script adds `dark` before the first paint when the person chose
    // the dark theme, so <html> must accept a class React did not render.
    <html lang="en" className={cn(interDisplay.variable, geistMono.variable)} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeSync />
        <ToastProvider position="top-right">
          <ErrorNavigator />
          <AnchoredToastProvider>
            <TooltipProvider>
              <AppProviders clerk={clerk}>{children}</AppProviders>
            </TooltipProvider>
          </AnchoredToastProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
