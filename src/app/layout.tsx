import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { MotionProvider } from "@/components/ui/motion-provider";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";
import { SITE_DESCRIPTION, SOCIAL_IMAGE } from "@/lib/marketing/copy";

import "./globals.css";
import { cn } from "@/lib/utils";

/**
 * Magic UI pairing on the coss font contract:
 * Geist → `--font-sans` (body, buttons, fields)
 * Instrument Serif → `--font-heading` (titles)
 * Geist Mono → `--font-mono` (code, tabular scores)
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-heading",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_SITE_ORIGIN),
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
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
  themeColor: "#07070b",
  colorScheme: "dark",
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
    <html
      lang="en"
      className={cn("dark", geistSans.variable, instrumentSerif.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ToastProvider position="top-right">
          <AnchoredToastProvider>
            <TooltipProvider>
              <MotionProvider>{children}</MotionProvider>
            </TooltipProvider>
          </AnchoredToastProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
