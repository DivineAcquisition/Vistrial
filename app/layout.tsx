import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Appointment Ledger`,
  description:
    "Pay-per-appointment ledger for Divine Acquisition: leads, response times, appointments, and billing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${heading.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground font-body antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
