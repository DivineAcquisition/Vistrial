"use client"

/**
 * Vistrial Landing Page
 * Marketing page with gradient brand buttons
 */

import { useState } from "react"
import Link from "next/link"
import {
  RiFlashlightLine,
  RiArrowRightLine,
  RiPlayLine,
  RiDashboardLine,
  RiCalendarLine,
  RiFileTextLine,
  RiSmartphoneLine,
  RiMenuLine,
  RiCloseLine,
} from "@remixicon/react"

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState("dashboard")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: RiDashboardLine },
    { id: "booking", label: "Booking", icon: RiCalendarLine },
    { id: "quotes", label: "Quotes", icon: RiFileTextLine },
    { id: "mobile", label: "Mobile", icon: RiSmartphoneLine },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600">
                <span className="text-lg font-bold text-white">Λ</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                Vistrial
              </span>
            </div>

            {/* Desktop CTA */}
            <div className="hidden items-center gap-3 sm:flex">
              <Link
                href="/onboarding"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 sm:hidden"
            >
              {mobileMenuOpen ? (
                <RiCloseLine className="h-6 w-6" />
              ) : (
                <RiMenuLine className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="mt-4 space-y-3 pb-4 sm:hidden">
              <Link
                href="/onboarding"
                className="block rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 pb-16 pt-12 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
            <RiFlashlightLine className="h-4 w-4" />
            Built for home service pros
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl md:text-6xl">
            Book more jobs.
            <br />
            Keep more customers.
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-xl text-lg text-gray-600 sm:text-xl">
            A booking page that converts one-time customers into recurring
            members. Start getting bookings in 10 minutes.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {/* Gradient Button - Primary CTA */}
            <Link
              href="/onboarding"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-400 to-brand-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:from-brand-500 hover:to-brand-700 hover:shadow-xl sm:w-auto"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                />
              </svg>
              Start Free Trial
              <RiArrowRightLine className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>

            {/* Secondary Button */}
            <button className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-8 py-4 text-lg font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 sm:w-auto">
              <RiPlayLine className="h-5 w-5" />
              See It In Action
            </button>
          </div>

          {/* Trust text */}
          <p className="mt-6 text-sm text-gray-500">
            No credit card required · Free for first 10 members
          </p>
        </div>
      </section>

      {/* Demo Section */}
      <section className="bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">
              See Vistrial in action
            </h2>
            <p className="text-gray-600">
              Everything you need to run your business
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-8 flex justify-center">
            <div className="inline-flex gap-2 rounded-lg bg-white p-1 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-brand-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Demo Preview */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400"></div>
                <div className="h-3 w-3 rounded-full bg-yellow-400"></div>
                <div className="h-3 w-3 rounded-full bg-green-400"></div>
              </div>
            </div>
            <div className="p-6">
              {activeTab === "dashboard" && (
                <div>
                  <h3 className="mb-1 text-xl font-bold text-gray-900">
                    Welcome back!
                  </h3>
                  <p className="mb-6 text-gray-500">
                    Here&apos;s what&apos;s happening today
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Today&apos;s Jobs</p>
                      <p className="text-2xl font-bold text-gray-900">8</p>
                      <p className="text-sm text-green-600">+2 from yesterday</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Revenue (MTD)</p>
                      <p className="text-2xl font-bold text-gray-900">$12,450</p>
                      <p className="text-sm text-green-600">+18% vs last month</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">New Members</p>
                      <p className="text-2xl font-bold text-gray-900">23</p>
                      <p className="text-sm text-green-600">+5 this week</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "booking" && (
                <div>
                  <h3 className="mb-4 text-xl font-bold text-gray-900">
                    Booking Calendar
                  </h3>
                  <div className="grid grid-cols-7 gap-1 text-center text-sm">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day) => (
                        <div key={day} className="py-2 font-medium text-gray-500">
                          {day}
                        </div>
                      )
                    )}
                    {[...Array(35)].map((_, i) => (
                      <div
                        key={i}
                        className={`rounded-lg py-3 ${
                          i === 15
                            ? "bg-brand-600 font-medium text-white"
                            : i > 2 && i < 33
                              ? "hover:bg-gray-100"
                              : "text-gray-300"
                        }`}
                      >
                        {((i - 2 + 31) % 31) + 1}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === "quotes" && (
                <div>
                  <h3 className="mb-4 text-xl font-bold text-gray-900">
                    Recent Quotes
                  </h3>
                  <div className="space-y-3">
                    {[
                      { name: "Sarah M.", service: "Deep Clean", amount: "$280" },
                      { name: "John D.", service: "Move-out Clean", amount: "$450" },
                      { name: "Lisa K.", service: "Weekly Service", amount: "$120/wk" },
                    ].map((quote, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{quote.name}</p>
                          <p className="text-sm text-gray-500">{quote.service}</p>
                        </div>
                        <p className="font-semibold text-brand-600">
                          {quote.amount}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === "mobile" && (
                <div className="flex justify-center">
                  <div className="w-64 rounded-3xl border-4 border-gray-800 bg-gray-900 p-2">
                    <div className="rounded-2xl bg-white p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-brand-600"></div>
                        <div>
                          <p className="text-sm font-medium">Next Job</p>
                          <p className="text-xs text-gray-500">2:00 PM Today</p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="font-medium text-gray-900">
                          123 Main Street
                        </p>
                        <p className="text-sm text-gray-500">
                          Standard Clean · 3 bed
                        </p>
                      </div>
                      <button className="mt-4 w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white">
                        Start Navigation
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-4 py-8">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Vistrial. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
