"use client"

/**
 * Vistrial Landing Page
 * Marketing page with app visuals - White theme
 * Mobile optimized with 3D button effects
 */

import { useState } from "react"
import Link from "next/link"
import { LogoIcon, LogoText } from "@/components/ui/Logo"
import {
  RiCalendarLine,
  RiMessage2Line,
  RiLoopLeftLine,
  RiFlashlightLine,
  RiCheckLine,
  RiArrowRightLine,
  RiPlayLine,
  RiTeamLine,
  RiMoneyDollarCircleLine,
  RiGlobalLine,
  RiBarChart2Line,
  RiDashboardLine,
  RiFileTextLine,
  RiSparklingLine,
  RiMenuLine,
  RiCloseLine,
  RiSmartphoneLine,
  RiNotification3Line,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "booking" | "quotes" | "mobile">("dashboard")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <LogoIcon size={28} className="md:w-8 md:h-8" />
            <LogoText className="text-gray-900 text-sm md:text-base" />
          </Link>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#demo" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Demo</a>
            <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/login" className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
              Log in
            </Link>
            <a
              href="https://app.vistrial.io/onboarding"
              className="relative bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:scale-[1.02] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
            >
              Get Started
            </a>
            
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              {mobileMenuOpen ? <RiCloseLine className="w-5 h-5" /> : <RiMenuLine className="w-5 h-5" />}
            </button>
          </div>
        </div>
        
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            <a href="#features" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#demo" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Demo</a>
            <a href="#pricing" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link href="/login" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-24 md:pt-32 pb-12 md:pb-20 px-4 relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-[20%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-gradient-to-br from-brand-400/10 to-transparent blur-3xl" />
          <div className="absolute top-[20%] right-[10%] w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full bg-gradient-to-br from-indigo-400/10 to-transparent blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium mb-4 md:mb-6 border border-brand-100">
            <RiFlashlightLine className="w-3 h-3 md:w-4 md:h-4" />
            Built for home service pros
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 md:mb-6 leading-tight">
            Book more jobs.<br />
            Keep more customers.
          </h1>
          
          <p className="text-base md:text-lg lg:text-xl text-gray-600 mb-6 md:mb-8 max-w-2xl mx-auto px-4">
            A booking page that converts one-time customers into recurring members. 
            Start getting bookings in 10 minutes.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-8 md:mb-12 px-4">
            <a
              href="https://app.vistrial.io/onboarding"
              className="relative w-full sm:w-auto bg-gradient-to-r from-brand-500 to-brand-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-semibold text-base md:text-lg hover:from-brand-600 hover:to-brand-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-brand-500/25 hover:shadow-2xl hover:shadow-brand-500/30 hover:scale-[1.02] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/25 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
            >
              <RiSparklingLine className="w-4 h-4 md:w-5 md:h-5" />
              Start Free Trial
              <RiArrowRightLine className="w-4 h-4 md:w-5 md:h-5" />
            </a>
            <a
              href="#demo"
              className="relative w-full sm:w-auto border-2 border-gray-200 text-gray-700 px-6 md:px-8 py-3 md:py-4 rounded-xl font-semibold text-base md:text-lg hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2 before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/80 before:border-b-gray-100 before:border-r-gray-100 before:pointer-events-none"
            >
              <RiPlayLine className="w-4 h-4 md:w-5 md:h-5" />
              See It In Action
            </a>
          </div>

          <p className="text-xs md:text-sm text-gray-500">
            No credit card required · Free for first 10 members
          </p>
        </div>
      </section>

      {/* App Screenshots Demo Section */}
      <section id="demo" className="py-12 md:py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 md:mb-4">
              See Vistrial in action
            </h2>
            <p className="text-sm md:text-lg text-gray-600">
              Everything you need to run your business
            </p>
          </div>

          {/* Tab Navigation - Scrollable on mobile */}
          <div className="flex justify-start md:justify-center gap-2 mb-6 md:mb-8 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
            {[
              { id: "dashboard", icon: RiDashboardLine, label: "Dashboard" },
              { id: "booking", icon: RiCalendarLine, label: "Booking" },
              { id: "quotes", icon: RiFileTextLine, label: "Quotes" },
              { id: "mobile", icon: RiSmartphoneLine, label: "Mobile" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={cn(
                  "relative flex items-center gap-1.5 md:gap-2 px-4 md:px-6 py-2 md:py-3 rounded-xl text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0",
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25 before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                )}
              >
                <tab.icon className="w-4 h-4 md:w-5 md:h-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Screenshot Display */}
          <div className="relative">
            {/* Dashboard Preview */}
            {activeTab === "dashboard" && (
              <div className="bg-white rounded-xl md:rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                {/* Browser Chrome */}
                <div className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex gap-1 md:gap-1.5">
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-400" />
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-amber-400" />
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-2 md:mx-4">
                    <div className="bg-white rounded-lg px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm text-gray-500 border border-gray-200 truncate">
                      app.vistrial.io/dashboard
                    </div>
                  </div>
                </div>
                
                {/* Dashboard Content */}
                <div className="p-3 md:p-6">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                    {/* Sidebar Mock - Hidden on mobile */}
                    <div className="hidden md:block w-48 flex-shrink-0 space-y-2">
                      <div className="flex items-center gap-3 px-3 py-2 bg-brand-50 rounded-lg border border-brand-100">
                        <RiDashboardLine className="w-4 h-4 md:w-5 md:h-5 text-brand-600" />
                        <span className="text-sm font-medium text-brand-700">Dashboard</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <RiCalendarLine className="w-4 h-4 md:w-5 md:h-5" />
                        <span className="text-sm">Bookings</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <RiTeamLine className="w-4 h-4 md:w-5 md:h-5" />
                        <span className="text-sm">Customers</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <RiFileTextLine className="w-4 h-4 md:w-5 md:h-5" />
                        <span className="text-sm">Quotes</span>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 space-y-4 md:space-y-6">
                      <div>
                        <h2 className="text-lg md:text-xl font-bold text-gray-900">Welcome back!</h2>
                        <p className="text-xs md:text-sm text-gray-500">Here&apos;s what&apos;s happening today.</p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                        <div className="bg-brand-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-brand-100">
                          <p className="text-xs text-brand-600">Today</p>
                          <p className="text-xl md:text-2xl font-bold text-brand-700">5</p>
                        </div>
                        <div className="bg-green-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-green-100">
                          <p className="text-xs text-green-600">This Week</p>
                          <p className="text-xl md:text-2xl font-bold text-green-700">23</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-amber-100">
                          <p className="text-xs text-amber-600">Members</p>
                          <p className="text-xl md:text-2xl font-bold text-amber-700">47</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-blue-100">
                          <p className="text-xs text-blue-600">Revenue</p>
                          <p className="text-xl md:text-2xl font-bold text-blue-700">$8.4k</p>
                        </div>
                      </div>

                      {/* Today's Schedule */}
                      <div className="border border-gray-200 rounded-lg md:rounded-xl">
                        <div className="p-3 md:p-4 border-b border-gray-200">
                          <h3 className="text-sm md:text-base font-semibold text-gray-900">Today&apos;s Schedule</h3>
                        </div>
                        <div className="divide-y divide-gray-200">
                          {[
                            { time: "9:00 AM", name: "Sarah J.", type: "Deep Clean", price: "$185" },
                            { time: "11:00 AM", name: "Mike C.", type: "Standard", price: "$145" },
                            { time: "2:00 PM", name: "Emily D.", type: "Move-Out", price: "$320" },
                          ].map((booking, i) => (
                            <div key={i} className="p-3 md:p-4 flex items-center justify-between">
                              <div className="flex items-center gap-2 md:gap-4">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <RiCalendarLine className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                                </div>
                                <div>
                                  <p className="text-xs md:text-sm font-medium text-gray-900">{booking.name}</p>
                                  <p className="text-xs text-gray-500">{booking.time} · {booking.type}</p>
                                </div>
                              </div>
                              <p className="text-xs md:text-sm font-semibold text-gray-900">{booking.price}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Booking Page Preview */}
            {activeTab === "booking" && (
              <div className="bg-white rounded-xl md:rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex gap-1 md:gap-1.5">
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-400" />
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-amber-400" />
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-2 md:mx-4">
                    <div className="bg-white rounded-lg px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm text-gray-500 border border-gray-200 truncate">
                      book.vistrial.io/sparkle-clean
                    </div>
                  </div>
                </div>

                <div className="p-3 md:p-6">
                  <div className="max-w-3xl mx-auto">
                    <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white p-4 md:p-6 rounded-t-xl -mx-3 md:-mx-6 -mt-3 md:-mt-6 mb-4 md:mb-6">
                      <h2 className="text-base md:text-xl font-bold">Sparkle Clean Co.</h2>
                      <p className="text-xs md:text-sm text-white/80">Book your cleaning in 60 seconds</p>
                    </div>

                    {/* Progress Steps - Simplified on mobile */}
                    <div className="flex items-center justify-between mb-4 md:mb-6 px-2">
                      {["Service", "Details", "Time", "Book"].map((step, i) => (
                        <div key={step} className="flex items-center gap-1 md:gap-2">
                          <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            i === 0 ? "bg-brand-600 text-white" : 
                            i < 2 ? "bg-green-500 text-white" : 
                            "bg-gray-200 text-gray-500"
                          }`}>
                            {i < 2 ? <RiCheckLine className="w-3 h-3 md:w-4 md:h-4" /> : i + 1}
                          </div>
                          <span className="hidden sm:inline text-xs text-gray-500">{step}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                      <div className="md:col-span-2 space-y-3 md:space-y-4">
                        <div className="p-3 md:p-4 border border-gray-200 rounded-lg md:rounded-xl">
                          <p className="text-sm font-medium text-gray-900 mb-2 md:mb-3">Select Service</p>
                          <div className="grid grid-cols-2 gap-2 md:gap-3">
                            <div className="p-2 md:p-3 border-2 border-brand-500 bg-brand-50 rounded-lg md:rounded-xl">
                              <p className="text-xs md:text-sm font-medium text-gray-900">Standard</p>
                              <p className="text-xs text-gray-500">From $120</p>
                            </div>
                            <div className="p-2 md:p-3 border border-gray-200 rounded-lg md:rounded-xl">
                              <p className="text-xs md:text-sm font-medium text-gray-900">Deep Clean</p>
                              <p className="text-xs text-gray-500">From $180</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-3 md:p-4 border border-gray-200 rounded-lg md:rounded-xl">
                          <p className="text-sm font-medium text-gray-900 mb-2 md:mb-3">How often?</p>
                          <div className="grid grid-cols-4 gap-1.5 md:gap-2">
                            {[
                              { label: "Weekly", discount: "15%" },
                              { label: "Biweekly", discount: "10%", selected: true },
                              { label: "Monthly", discount: "5%" },
                              { label: "Once", discount: null },
                            ].map((freq) => (
                              <div key={freq.label} className={`p-2 md:p-3 border rounded-lg md:rounded-xl text-center ${
                                freq.selected ? "border-brand-500 bg-brand-50" : "border-gray-200"
                              }`}>
                                <p className="text-xs font-medium text-gray-900">{freq.label}</p>
                                {freq.discount && (
                                  <p className="text-[10px] md:text-xs text-green-600">{freq.discount} off</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Summary - Stacks on mobile */}
                      <div className="bg-gray-50 rounded-lg md:rounded-xl p-3 md:p-4">
                        <p className="text-sm font-medium text-gray-900 mb-3 md:mb-4">Summary</p>
                        <div className="space-y-2 text-xs md:text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Service</span>
                            <span className="text-gray-900">Standard</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Frequency</span>
                            <span className="text-green-600">Biweekly</span>
                          </div>
                          <div className="border-t border-gray-200 pt-2 mt-2">
                            <div className="flex justify-between text-green-600">
                              <span>Discount</span>
                              <span>-$14</span>
                            </div>
                            <div className="flex justify-between font-semibold text-base md:text-lg mt-1">
                              <span className="text-gray-900">Total</span>
                              <span className="text-brand-600">$131</span>
                            </div>
                          </div>
                        </div>
                        <button className="relative w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white py-2.5 md:py-3 rounded-lg md:rounded-xl mt-3 md:mt-4 text-sm font-medium shadow-lg shadow-brand-500/25 before:absolute before:inset-[1px] before:rounded-[8px] md:before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none">
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quotes Preview */}
            {activeTab === "quotes" && (
              <div className="bg-white rounded-xl md:rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex gap-1 md:gap-1.5">
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-400" />
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-amber-400" />
                    <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-2 md:mx-4">
                    <div className="bg-white rounded-lg px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm text-gray-500 border border-gray-200 truncate">
                      app.vistrial.io/quotes
                    </div>
                  </div>
                </div>

                <div className="p-3 md:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
                    <div>
                      <h2 className="text-lg md:text-xl font-bold text-gray-900">Quotes</h2>
                      <p className="text-xs md:text-sm text-gray-500">Track and manage your quotes</p>
                    </div>
                    <button className="relative bg-gradient-to-r from-brand-500 to-brand-600 text-white px-3 md:px-4 py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-medium flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 before:absolute before:inset-[1px] before:rounded-[8px] md:before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none">
                      <RiFileTextLine className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      New Quote
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
                    <div className="bg-gray-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-gray-100">
                      <p className="text-xs text-gray-500">Sent</p>
                      <p className="text-xl md:text-2xl font-bold text-gray-900">12</p>
                    </div>
                    <div className="bg-green-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-green-100">
                      <p className="text-xs text-green-600">Won</p>
                      <p className="text-xl md:text-2xl font-bold text-green-700">8</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-amber-100">
                      <p className="text-xs text-amber-600">Pending</p>
                      <p className="text-xl md:text-2xl font-bold text-amber-700">3</p>
                    </div>
                    <div className="bg-brand-50 rounded-lg md:rounded-xl p-3 md:p-4 border border-brand-100">
                      <p className="text-xs text-brand-600">Revenue</p>
                      <p className="text-xl md:text-2xl font-bold text-brand-700">$4.2k</p>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg md:rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-200">
                      {[
                        { name: "John S.", service: "Deep Clean", amount: "$220", status: "pending", followUp: "Day 3" },
                        { name: "Lisa W.", service: "Move-Out", amount: "$380", status: "accepted" },
                        { name: "Tom B.", service: "Standard", amount: "$145", status: "sent", followUp: "Day 1" },
                      ].map((quote, i) => (
                        <div key={i} className="p-3 md:p-4 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 md:gap-4 min-w-0">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-gray-600">
                                {quote.name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs md:text-sm font-medium text-gray-900 truncate">{quote.name}</p>
                              <p className="text-xs text-gray-500 truncate">{quote.service}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                            {quote.followUp && (
                              <span className="hidden sm:inline text-[10px] md:text-xs bg-blue-100 text-blue-700 px-1.5 md:px-2 py-0.5 md:py-1 rounded-full">
                                {quote.followUp}
                              </span>
                            )}
                            <span className={`text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded-full ${
                              quote.status === "accepted" ? "bg-green-100 text-green-700" :
                              quote.status === "pending" ? "bg-amber-100 text-amber-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {quote.status}
                            </span>
                            <p className="text-xs md:text-sm font-semibold text-gray-900">{quote.amount}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Preview */}
            {activeTab === "mobile" && (
              <div className="flex justify-center gap-4 md:gap-8">
                {/* Phone 1 - Customer Notification */}
                <div className="w-48 md:w-64">
                  <div className="bg-gray-900 rounded-[2rem] md:rounded-[3rem] p-2 md:p-3 shadow-2xl">
                    <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden">
                      {/* Phone Header */}
                      <div className="bg-gray-100 px-4 md:px-6 py-2 md:py-3 flex justify-center">
                        <div className="w-16 md:w-20 h-1 bg-gray-300 rounded-full" />
                      </div>
                      
                      {/* Notification Content */}
                      <div className="p-3 md:p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <RiNotification3Line className="w-4 h-4 text-brand-500" />
                          <span className="text-[10px] md:text-xs text-gray-500">New Notification</span>
                        </div>
                        
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                              <RiCalendarLine className="w-4 h-4 text-brand-600" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-900">Booking Confirmed!</p>
                              <p className="text-[10px] text-gray-500">Sparkle Clean Co.</p>
                            </div>
                          </div>
                          <div className="text-[10px] md:text-xs text-gray-600 space-y-1">
                            <p>📅 Tomorrow, 10:00 AM</p>
                            <p>🏠 123 Main Street</p>
                            <p>💰 $145 (Standard Clean)</p>
                          </div>
                        </div>

                        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                          <div className="flex items-center gap-2">
                            <RiCheckLine className="w-4 h-4 text-green-600" />
                            <p className="text-xs font-medium text-green-700">Payment Received</p>
                          </div>
                          <p className="text-[10px] text-green-600 mt-1">$25 deposit paid</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-xs md:text-sm text-gray-500 mt-3 md:mt-4">Customer View</p>
                </div>

                {/* Phone 2 - Business SMS */}
                <div className="w-48 md:w-64">
                  <div className="bg-gray-900 rounded-[2rem] md:rounded-[3rem] p-2 md:p-3 shadow-2xl">
                    <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden">
                      {/* Phone Header */}
                      <div className="bg-gray-100 px-4 md:px-6 py-2 md:py-3 flex justify-center">
                        <div className="w-16 md:w-20 h-1 bg-gray-300 rounded-full" />
                      </div>
                      
                      {/* SMS Content */}
                      <div className="p-3 md:p-4 space-y-2 md:space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <RiMessage2Line className="w-4 h-4 text-green-500" />
                          <span className="text-[10px] md:text-xs text-gray-500">SMS Follow-up</span>
                        </div>
                        
                        {/* Messages */}
                        <div className="space-y-2">
                          <div className="bg-brand-500 text-white rounded-2xl rounded-br-sm px-3 py-2 text-[10px] md:text-xs ml-4">
                            Hi Sarah! Just following up on your quote for deep cleaning. Any questions I can answer?
                          </div>
                          <div className="text-[9px] text-gray-400 text-right mr-2">Sent 2h ago</div>
                          
                          <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-3 py-2 text-[10px] md:text-xs mr-4">
                            Yes! Can you do this Saturday?
                          </div>
                          <div className="text-[9px] text-gray-400 ml-2">Received 1h ago</div>
                          
                          <div className="bg-brand-500 text-white rounded-2xl rounded-br-sm px-3 py-2 text-[10px] md:text-xs ml-4">
                            Absolutely! I have 10am or 2pm available. Which works better?
                          </div>
                        </div>
                        
                        <div className="bg-green-50 rounded-lg p-2 border border-green-100 mt-2">
                          <p className="text-[10px] text-green-700 font-medium">🎉 Quote Accepted!</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-xs md:text-sm text-gray-500 mt-3 md:mt-4">Auto Follow-ups</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-8 md:py-12 border-y border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-center text-xs md:text-sm text-gray-500 mb-4 md:mb-6">Trusted by 500+ home service businesses</p>
          <div className="flex items-center justify-center gap-6 md:gap-12 opacity-40 flex-wrap">
            {["SparkleClean", "TidyHome", "FreshStart", "CleanSweep"].map((name) => (
              <span key={name} className="text-sm md:text-xl font-bold text-gray-400">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 md:py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 md:mb-4">
              Everything you need
            </h2>
            <p className="text-sm md:text-lg text-gray-600">
              One platform for booking, billing, and retention.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8">
            {[
              { icon: RiGlobalLine, title: "Embed Anywhere", description: "Add to any website with one line of code", bgColor: "bg-brand-100", iconColor: "text-brand-600" },
              { icon: RiLoopLeftLine, title: "Recurring Billing", description: "Convert to recurring memberships", bgColor: "bg-green-100", iconColor: "text-green-600" },
              { icon: RiTeamLine, title: "Customer Portal", description: "Self-serve booking management", bgColor: "bg-blue-100", iconColor: "text-blue-600" },
              { icon: RiMoneyDollarCircleLine, title: "Instant Quotes", description: "Create and send in seconds", bgColor: "bg-amber-100", iconColor: "text-amber-600" },
              { icon: RiMessage2Line, title: "SMS Follow-ups", description: "Automated text reminders", bgColor: "bg-pink-100", iconColor: "text-pink-600" },
              { icon: RiBarChart2Line, title: "Analytics", description: "Revenue and booking insights", bgColor: "bg-gray-100", iconColor: "text-gray-600" },
            ].map((feature) => (
              <div key={feature.title} className="bg-gray-50 rounded-xl p-4 md:p-6 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className={`w-10 h-10 md:w-12 md:h-12 ${feature.bgColor} rounded-xl flex items-center justify-center mb-3 md:mb-4`}>
                  <feature.icon className={`w-5 h-5 md:w-6 md:h-6 ${feature.iconColor}`} />
                </div>
                <h3 className="text-sm md:text-lg font-semibold text-gray-900 mb-1 md:mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs md:text-sm text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-12 md:py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 md:mb-4">
              Simple, fair pricing
            </h2>
            <p className="text-sm md:text-lg text-gray-600">
              Pay for what you use. No monthly minimums.
            </p>
          </div>

          <div className="bg-white rounded-xl md:rounded-2xl shadow-xl overflow-hidden border border-gray-200">
            <div className="p-6 md:p-8 text-center border-b border-gray-200">
              <p className="text-xs md:text-sm text-gray-500 mb-2">Per active recurring member</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl md:text-5xl font-bold text-gray-900">$5</span>
                <span className="text-sm md:text-base text-gray-500">/month</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                + Stripe fees passed through
              </p>
            </div>

            <div className="p-4 md:p-8">
              <p className="text-sm font-medium text-gray-900 mb-3 md:mb-4">Includes:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4">
                {[
                  "Embeddable booking page",
                  "Membership billing",
                  "SMS notifications",
                  "Quote follow-ups",
                  "Customer portal",
                  "Dashboard & reports",
                  "Unlimited one-time bookings",
                  "Email support",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <RiCheckLine className="w-4 h-4 md:w-5 md:h-5 text-green-500 flex-shrink-0" />
                    <span className="text-xs md:text-sm text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 md:p-8 bg-gray-50 border-t border-gray-200">
              <a
                href="https://app.vistrial.io/onboarding"
                className="relative block w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white py-3 md:py-4 rounded-xl font-semibold text-sm md:text-lg hover:from-brand-600 hover:to-brand-700 transition-all text-center shadow-lg shadow-brand-500/25 hover:shadow-xl before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/25 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
              >
                Start Free Trial
              </a>
              <p className="text-center text-xs text-gray-500 mt-3">
                First 10 members free forever
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-20 px-4 bg-gradient-to-br from-brand-500 to-brand-600 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-[20%] w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 right-[20%] w-[150px] md:w-[300px] h-[150px] md:h-[300px] rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-3 md:mb-4">
            Stop losing customers
          </h2>
          <p className="text-sm md:text-lg lg:text-xl text-white/80 mb-6 md:mb-8 px-4">
            Set up your booking page in 10 minutes and start converting.
          </p>
          <a
            href="https://app.vistrial.io/onboarding"
            className="relative inline-flex items-center gap-2 bg-white text-brand-700 px-6 md:px-8 py-3 md:py-4 rounded-xl font-semibold text-sm md:text-lg hover:bg-gray-100 transition-all shadow-xl hover:scale-[1.02] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/50 before:border-b-gray-200/50 before:border-r-gray-200/50 before:pointer-events-none"
          >
            Get Started Free
            <RiArrowRightLine className="w-4 h-4 md:w-5 md:h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 md:py-12 px-4 border-t border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <LogoIcon size={28} />
              <LogoText className="text-gray-900 text-sm" />
            </div>
            <div className="flex items-center gap-6 md:gap-8 text-xs md:text-sm text-gray-500">
              <a href="#" className="hover:text-gray-700">Privacy</a>
              <a href="#" className="hover:text-gray-700">Terms</a>
              <a href="#" className="hover:text-gray-700">Support</a>
            </div>
            <p className="text-xs md:text-sm text-gray-500">
              © 2026 Vistrial
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
