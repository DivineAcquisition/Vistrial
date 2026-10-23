import type { Metadata, Viewport } from "next";

import { InlineScript } from "@/components/app/inline-script";
import { ThemeSync } from "@/components/app/theme-toggle";
import { AppProviders } from "@/components/providers/app-providers";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";
import { geistMono, interDisplay } from "@/lib/fonts";
import { SITE_DESCRIPTION, SOCIAL_IMAGE } from "@/lib/marketing/copy";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_SITE_ORIGIN),
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: APP_NAME,
    locale: "en_US",
    type: "website",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          <AnchoredToastProvider>
            <TooltipProvider>
              <AppProviders>{children}</AppProviders>
            </TooltipProvider>
          </AnchoredToastProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
