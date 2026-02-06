import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { siteConfig } from "./siteConfig"
import { AuthProvider } from "@/components/auth/auth-provider"
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  metadataBase: new URL("https://vistrial.com"),
  title: siteConfig.name,
  description: siteConfig.description,
  keywords: ["quote follow-up", "home service", "automation", "SMS"],
  authors: [
    {
      name: "Vistrial",
      url: "https://vistrial.com",
    },
  ],
  creator: "Vistrial",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  icons: {
    icon: "/favicon.ico",
  },
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
        <ThemeProvider defaultTheme="system" attribute="class">
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
