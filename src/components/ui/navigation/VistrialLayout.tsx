"use client"

import { useState } from "react"
import { VistrialSidebar } from "./VistrialSidebar"
import { RiMenuLine, RiAddLine } from "@remixicon/react"
import { Button } from "@/components/Button"
import { usePathname } from "next/navigation"

interface VistrialLayoutProps {
  children: React.ReactNode
  onAddLead?: () => void
}

export function VistrialLayout({ children, onAddLead }: VistrialLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const pathname = usePathname()

  const getPageTitle = () => {
    if (pathname.includes("/overview")) return "Dashboard"
    if (pathname.includes("/details") || pathname.includes("/leads")) return "Leads"
    if (pathname.includes("/sequences")) return "Sequences"
    if (pathname.includes("/settings")) return "Settings"
    return "Dashboard"
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <VistrialSidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50">
            <VistrialSidebar
              isCollapsed={false}
              onToggle={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-lg p-2 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-800"
            >
              <RiMenuLine className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                {getPageTitle()}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          {onAddLead && (
            <Button onClick={onAddLead} className="gap-2">
              <RiAddLine className="h-5 w-5" />
              <span className="hidden sm:inline">Add Lead</span>
            </Button>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
