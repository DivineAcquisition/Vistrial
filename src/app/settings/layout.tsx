"use client"

import { siteConfig } from "@/app/siteConfig"
import { VistrialLayout } from "@/components/ui/navigation/VistrialLayout"
import { cx } from "@/lib/utils"
import {
  RiUserLine,
  RiPhoneLine,
  RiFlashlightLine,
  RiNotification3Line,
} from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navigationSettings = [
  { name: "Profile", href: siteConfig.baseLinks.settings.general, icon: RiUserLine },
  { name: "Twilio Setup", href: siteConfig.baseLinks.settings.billing, icon: RiPhoneLine },
  { name: "Job Types", href: siteConfig.baseLinks.settings.users, icon: RiFlashlightLine },
  { name: "Notifications", href: "#", icon: RiNotification3Line },
]

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  return (
    <VistrialLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
            Settings
          </h2>
          <p className="text-gray-400">
            Manage your account and integrations
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Sidebar */}
          <div className="relative h-fit">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
              <nav className="space-y-1">
                {navigationSettings.map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cx(
                        "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300",
                        active
                          ? "bg-gradient-to-r from-brand-500/20 to-brand-600/20 text-white border border-brand-500/30"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {active && (
                        <div className="absolute inset-0 rounded-xl bg-brand-500/10 blur-lg -z-10" />
                      )}
                      <div className={cx(
                        "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300",
                        active
                          ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
                          : "bg-white/5 group-hover:bg-white/10"
                      )}>
                        <item.icon className={cx(
                          "h-4 w-4",
                          active ? "text-white" : "text-gray-400 group-hover:text-white"
                        )} />
                      </div>
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6 lg:col-span-2">{children}</div>
        </div>
      </div>
    </VistrialLayout>
  )
}
