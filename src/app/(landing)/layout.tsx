/**
 * Landing Page Layout
 * No sidebar, full-width for marketing pages
 */

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Vistrial - Booking & Membership for Cleaning Companies",
  description: "Book more jobs. Keep more customers. A booking page that converts one-time customers into recurring members.",
}

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
