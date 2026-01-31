/**
 * Landing Page Layout
 * No sidebar, full-width for marketing pages
 */

import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { Inter } from "next/font/google"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "Vistrial - Booking & Membership for Home Service Pros",
  description:
    "Book more jobs. Keep more customers. A booking page that converts one-time customers into recurring members.",
}

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} bg-white antialiased selection:bg-brand-100 selection:text-brand-700`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="light" attribute="class">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
