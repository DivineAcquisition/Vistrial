"use client"

import { siteConfig } from "@/app/siteConfig"
import { VistrialLayout } from "@/components/ui/navigation/VistrialLayout"
import { Card } from "@/components/Card"
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Settings
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Manage your account and integrations
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Sidebar */}
          <Card className="h-fit p-4">
            <nav className="space-y-1">
              {navigationSettings.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    pathname === item.href
                      ? "bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
            </nav>
          </Card>

          {/* Content */}
          <div className="space-y-6 lg:col-span-2">{children}</div>
        </div>
      </div>
    </VistrialLayout>
  )
}
