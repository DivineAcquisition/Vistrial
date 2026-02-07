"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2,
  Sparkles,
  Clock,
  MapPin,
  CreditCard,
  Palette,
  Bell,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"

const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Business Profile", icon: Building2 },
  { href: "/settings/services", label: "Services", icon: Sparkles },
  { href: "/settings/availability", label: "Availability", icon: Clock },
  { href: "/settings/service-areas", label: "Service Areas", icon: MapPin },
  { href: "/settings/payments", label: "Payments", icon: CreditCard },
  { href: "/settings/booking", label: "Booking Page", icon: Palette },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/team", label: "Team", icon: Users },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex gap-6 p-6">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0">
        <nav className="sticky top-24 space-y-1">
          {SETTINGS_NAV.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
