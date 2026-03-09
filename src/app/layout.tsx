import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { siteConfig } from "./siteConfig"
import { AuthProvider } from "@/components/auth/auth-provider"
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  metadataBase: new URL("https://vistrial.io"),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "service business automation",
    "client follow-up",
    "SMS automation",
    "workflow automation",
    "service business CRM",
    "client retention",
    "recurring revenue",
    "business operations platform",
    "automated outreach",
    "service business growth",
  ],
  authors: [{ name: "Vistrial", url: "https://vistrial.io" }],
  creator: "Vistrial",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body
        className={`${GeistSans.className} antialiased selection:bg-brand-100 selection:text-brand-600 bg-white dark:bg-gray-950`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="light" attribute="class" forcedTheme="light">
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
