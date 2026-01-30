"use client"

import { siteConfig } from "@/app/siteConfig"
import { cx } from "@/lib/utils"
import Image from "next/image"
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
  { name: "Dashboard", href: siteConfig.baseLinks.overview, icon: RiDashboardLine },
  { name: "Leads", href: siteConfig.baseLinks.details, icon: RiUserLine },
  { name: "Quotes", href: "/quotes", icon: RiFileTextLine },
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
    if (itemHref === "/quotes") {
      return pathname.startsWith("/quotes")
    }
    return pathname === itemHref || pathname.startsWith(itemHref)
  }

  return (
    <div
      className={cx(
        "flex h-screen flex-col bg-gray-900/80 backdrop-blur-xl border-r border-white/10 transition-all duration-300",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="border-b border-white/10 p-4">
        <Link href="/overview" className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-500 rounded-xl blur-md opacity-50" />
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/25">
              <Image
                src="/Untitled design (2).png"
                alt="Vistrial"
                width={28}
                height={28}
                className="rounded-lg"
                unoptimized
              />
            </div>
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold text-white">Vistrial</h1>
              <p className="text-xs text-gray-400">Quote Follow-Up</p>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.name}>
                <Link
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
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-300",
                    active
                      ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    <item.icon className={cx(
                      "h-4 w-4",
                      active ? "text-white" : "text-gray-400 group-hover:text-white"
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
        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">Leads Used</span>
              <span className="text-sm font-medium text-white">42 / 100</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 relative"
                style={{ width: "42%" }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">Pro Plan • Resets Feb 1</p>
          </div>
        </div>
      )}

      {/* User */}
      <div className="border-t border-white/10 p-4">
        <DropdownUserProfile align="start">
          <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-600/20 border border-white/10">
              <RiUserLine className="h-5 w-5 text-brand-400" />
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
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-xl p-2.5 text-gray-400 hover:bg-white/5 hover:text-white transition-all"
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
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <RiSparklingLine className="w-3 h-3" />
            <span>Powered by Vistrial</span>
          </div>
        </div>
      )}
    </div>
  )
}
