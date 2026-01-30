"use client"

import { useState } from "react"
import { VistrialSidebar } from "./VistrialSidebar"
import { RiMenuLine, RiAddLine, RiSearchLine, RiNotification3Line } from "@remixicon/react"
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
    if (pathname.includes("/quotes")) return "Quotes"
    return "Dashboard"
  }

  return (
    <div className="flex h-screen bg-gray-50">
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
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
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
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-xl p-2.5 bg-gray-100 hover:bg-gray-200 lg:hidden transition-all"
            >
              <RiMenuLine className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {getPageTitle()}
              </h1>
              <p className="text-sm text-gray-500">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="hidden md:block relative">
              <RiSearchLine className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-64 pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
              />
            </div>
            
            {/* Notifications */}
            <button className="relative p-2.5 text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all">
              <RiNotification3Line className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full ring-2 ring-white" />
            </button>
            
            {onAddLead && (
              <Button onClick={onAddLead} className="gap-2">
                <RiAddLine className="h-5 w-5" />
                <span className="hidden sm:inline">Add Lead</span>
              </Button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">{children}</main>
      </div>
    </div>
  )
}
