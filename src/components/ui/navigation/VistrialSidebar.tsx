"use client"

import { siteConfig } from "@/app/siteConfig"
import { cx } from "@/lib/utils"
import {
  RiDashboardLine,
  RiUserLine,
  RiFlashlightLine,
  RiSettings4Line,
  RiMenuFoldLine,
  RiMenuUnfoldLine,
} from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { DropdownUserProfile } from "./DropdownUserProfile"

const navigation = [
  { name: "Dashboard", href: siteConfig.baseLinks.overview, icon: RiDashboardLine },
  { name: "Leads", href: siteConfig.baseLinks.details, icon: RiUserLine },
  { name: "Sequences", href: "/sequences", icon: RiFlashlightLine },
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
    return pathname === itemHref || pathname.startsWith(itemHref)
  }

  return (
    <div
      className={cx(
        "flex h-screen flex-col bg-gray-900 transition-all duration-300 dark:bg-gray-950",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
            <RiFlashlightLine className="h-6 w-6 text-white" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-white">Vistrial</h1>
              <p className="text-xs text-gray-400">Quote Follow-Up</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={cx(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-colors",
                  isActive(item.href)
                    ? "bg-brand-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && <span className="text-sm font-medium">{item.name}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Usage */}
      {!isCollapsed && (
        <div className="border-t border-gray-800 p-4">
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-400">Leads Used</span>
              <span className="text-sm font-medium text-white">42 / 100</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: "42%" }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">Pro Plan • Resets Feb 1</p>
          </div>
        </div>
      )}

      {/* User */}
      <div className="border-t border-gray-800 p-4">
        <DropdownUserProfile align="start">
          <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-800">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-700">
              <RiUserLine className="h-5 w-5 text-gray-300" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">Pro Plumbing</p>
                <p className="truncate text-xs text-gray-400">malik@example.com</p>
              </div>
            )}
          </button>
        </DropdownUserProfile>
      </div>

      {/* Toggle Button */}
      <div className="border-t border-gray-800 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          {isCollapsed ? (
            <RiMenuUnfoldLine className="h-5 w-5" />
          ) : (
            <RiMenuFoldLine className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  )
}
