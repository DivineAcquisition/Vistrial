"use client"

import { siteConfig } from "@/app/siteConfig"
import { cx } from "@/lib/utils"
import { Logo } from "@/components/ui/Logo"
import {
  RiDashboardLine,
  RiUserLine,
  RiFlashlightLine,
  RiSettings4Line,
  RiMenuFoldLine,
  RiMenuUnfoldLine,
  RiFileTextLine,
  RiSparklingLine,
} from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { DropdownUserProfile } from "./DropdownUserProfile"

const navigation = [
  { name: "Dashboard", href: siteConfig.baseLinks.dashboard, icon: RiDashboardLine },
  { name: "Bookings", href: siteConfig.baseLinks.bookings, icon: RiUserLine },
  { name: "Quotes", href: siteConfig.baseLinks.quotes, icon: RiFileTextLine },
  { name: "Sequences", href: siteConfig.baseLinks.sequences, icon: RiFlashlightLine },
  { name: "Settings", href: siteConfig.baseLinks.settings.general, icon: RiSettings4Line },
] as const

interface VistrialSidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function VistrialSidebar({ isCollapsed, onToggle }: VistrialSidebarProps) {
  const pathname = usePathname()

  const isActive = (itemHref: string) => {
    if (itemHref === siteConfig.baseLinks.settings.general) {
      return pathname.startsWith("/settings")
    }
    if (itemHref === "/sequences") {
      return pathname.startsWith("/sequences")
    }
    if (itemHref === "/quotes") {
      return pathname.startsWith("/quotes")
    }
    return pathname === itemHref || pathname.startsWith(itemHref)
  }

  return (
    <div
      className={cx(
        "flex h-screen flex-col bg-white border-r border-gray-200 transition-all duration-300",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="border-b border-gray-100 p-4">
        <Link href="/overview" className="flex items-center">
          {isCollapsed ? (
            <Logo size="sm" />
          ) : (
            <Logo size="md" />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1.5">
          {navigation.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cx(
                    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                    active
                      ? "bg-brand-50 text-brand-700 border border-brand-200"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  {active && (
                    <div className="absolute inset-0 rounded-xl bg-brand-500/5 blur-lg -z-10" />
                  )}
                  <div className={cx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                    active
                      ? "bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25"
                      : "bg-gray-100 group-hover:bg-gray-200"
                  )}>
                    <item.icon className={cx(
                      "h-4 w-4",
                      active ? "text-white" : "text-gray-500 group-hover:text-gray-700"
                    )} />
                  </div>
                  {!isCollapsed && <span className="text-sm font-medium">{item.name}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Usage */}
      {!isCollapsed && (
        <div className="border-t border-gray-100 p-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">Leads Used</span>
              <span className="text-sm font-medium text-gray-900">42 / 100</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 relative"
                style={{ width: "42%" }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">Pro Plan • Resets Feb 1</p>
          </div>
        </div>
      )}

      {/* User */}
      <div className="border-t border-gray-100 p-4">
        <DropdownUserProfile align="start">
          <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-100 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-200">
              <RiUserLine className="h-5 w-5 text-brand-600" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">Pro Plumbing</p>
                <p className="truncate text-xs text-gray-500">malik@example.com</p>
              </div>
            )}
          </button>
        </DropdownUserProfile>
      </div>

      {/* Toggle Button */}
      <div className="border-t border-gray-100 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-xl p-2.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
        >
          {isCollapsed ? (
            <RiMenuUnfoldLine className="h-5 w-5" />
          ) : (
            <RiMenuFoldLine className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Footer */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <RiSparklingLine className="w-3 h-3" />
            <span>Powered by Vistrial</span>
          </div>
        </div>
      )}
    </div>
  )
}
