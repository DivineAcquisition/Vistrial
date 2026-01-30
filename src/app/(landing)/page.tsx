"use client"

/**
 * Vistrial Landing Page
 * Marketing page with app visuals
 */

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
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
} from "@remixicon/react"

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "booking" | "quotes">("dashboard")

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/Untitled design (2).png"
              alt="Vistrial"
              width={32}
              height={32}
              className="rounded-lg"
              unoptimized
            />
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={100}
              height={28}
              className="h-7 w-auto"
              unoptimized
            />
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50">Features</a>
            <a href="#demo" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50">Demo</a>
            <a href="#pricing" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 font-medium">
              Log in
            </Link>
            <Link
              href="/signup"
              className="bg-brand-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <RiFlashlightLine className="w-4 h-4" />
            Built for home service pros
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-gray-50 mb-6 leading-tight">
            Book more jobs.<br />
            Keep more customers.
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            A booking page that converts one-time customers into recurring members. 
            Embed it on your site or share a link. Start getting bookings in 10 minutes.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/signup"
              className="w-full sm:w-auto bg-brand-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
            >
              Start Free Trial
              <RiArrowRightLine className="w-5 h-5" />
            </Link>
            <a
              href="#demo"
              className="w-full sm:w-auto border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-8 py-4 rounded-xl font-semibold text-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              <RiPlayLine className="w-5 h-5" />
              See It In Action
            </a>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            No credit card required · Free for first 10 members · Cancel anytime
          </p>
        </div>
      </section>

      {/* App Screenshots Demo Section */}
      <section id="demo" className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-4">
              See Vistrial in action
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Everything you need to run your business, in one place
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex justify-center gap-2 mb-8">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "dashboard"
                  ? "bg-brand-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <RiDashboardLine className="w-5 h-5" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("booking")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "booking"
                  ? "bg-brand-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <RiCalendarLine className="w-5 h-5" />
              Booking Page
            </button>
            <button
              onClick={() => setActiveTab("quotes")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "quotes"
                  ? "bg-brand-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <RiFileTextLine className="w-5 h-5" />
              Quotes
            </button>
          </div>

          {/* Screenshot Display */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-t from-gray-50 dark:from-gray-900 via-transparent to-transparent z-10 pointer-events-none" />
            
            {/* Dashboard Preview */}
            {activeTab === "dashboard" && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                {/* Browser Chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                      app.vistrial.io/dashboard
                    </div>
                  </div>
                </div>
                
                {/* Dashboard Content */}
                <div className="p-6">
                  <div className="flex gap-6">
                    {/* Sidebar Mock */}
                    <div className="w-48 flex-shrink-0 space-y-2">
                      <div className="flex items-center gap-3 px-3 py-2 bg-brand-50 dark:bg-brand-900/30 rounded-lg">
                        <RiDashboardLine className="w-5 h-5 text-brand-600" />
                        <span className="font-medium text-brand-700 dark:text-brand-300">Dashboard</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-gray-400">
                        <RiCalendarLine className="w-5 h-5" />
                        <span>Bookings</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-gray-400">
                        <RiTeamLine className="w-5 h-5" />
                        <span>Customers</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-gray-400">
                        <RiFileTextLine className="w-5 h-5" />
                        <span>Quotes</span>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 space-y-6">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Welcome back, Maria!</h2>
                        <p className="text-gray-500 dark:text-gray-400">Here&apos;s what&apos;s happening today.</p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-brand-50 dark:bg-brand-900/30 rounded-xl p-4">
                          <p className="text-sm text-brand-600 dark:text-brand-400">Today</p>
                          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">5</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-4">
                          <p className="text-sm text-green-600 dark:text-green-400">This Week</p>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-300">23</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-4">
                          <p className="text-sm text-amber-600 dark:text-amber-400">Members</p>
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">47</p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4">
                          <p className="text-sm text-blue-600 dark:text-blue-400">Revenue</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">$8,420</p>
                        </div>
                      </div>

                      {/* Today's Schedule */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-50">Today&apos;s Schedule</h3>
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                          {[
                            { time: "9:00 AM", name: "Sarah Johnson", type: "Deep Clean", price: "$185" },
                            { time: "11:00 AM", name: "Mike Chen", type: "Standard", price: "$145" },
                            { time: "2:00 PM", name: "Emily Davis", type: "Move-Out", price: "$320" },
                          ].map((booking, i) => (
                            <div key={i} className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                                  <RiCalendarLine className="w-5 h-5 text-gray-500" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-gray-50">{booking.name}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{booking.time} · {booking.type}</p>
                                </div>
                              </div>
                              <p className="font-semibold text-gray-900 dark:text-gray-50">{booking.price}</p>
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
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                {/* Mobile Frame */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                      book.vistrial.io/sparkle-clean
                    </div>
                  </div>
                </div>

                {/* Booking Content */}
                <div className="p-6">
                  <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white p-6 rounded-t-xl -mx-6 -mt-6 mb-6">
                      <h2 className="text-xl font-bold">Sparkle Clean Co.</h2>
                      <p className="text-white/80">Book your cleaning in 60 seconds</p>
                    </div>

                    {/* Progress */}
                    <div className="flex items-center justify-between mb-6">
                      {["Service", "Property", "Schedule", "Contact", "Book"].map((step, i) => (
                        <div key={step} className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            i === 0 ? "bg-brand-600 text-white" : 
                            i < 2 ? "bg-green-500 text-white" : 
                            "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          }`}>
                            {i < 2 ? <RiCheckLine className="w-4 h-4" /> : i + 1}
                          </div>
                          <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">{step}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 space-y-4">
                        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <p className="font-medium text-gray-900 dark:text-gray-50 mb-3">Select Service</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 border-2 border-brand-600 bg-brand-50 dark:bg-brand-900/30 rounded-xl">
                              <p className="font-medium text-gray-900 dark:text-gray-50">Standard Clean</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">From $120</p>
                            </div>
                            <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-xl">
                              <p className="font-medium text-gray-900 dark:text-gray-50">Deep Clean</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">From $180</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <p className="font-medium text-gray-900 dark:text-gray-50 mb-3">How often?</p>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: "Weekly", discount: "15% off", badge: "Best" },
                              { label: "Biweekly", discount: "10% off", badge: null },
                              { label: "Monthly", discount: "5% off", badge: null },
                              { label: "One-time", discount: null, badge: null },
                            ].map((freq) => (
                              <div key={freq.label} className={`p-3 border rounded-xl text-center relative ${
                                freq.label === "Biweekly" ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30" : "border-gray-200 dark:border-gray-700"
                              }`}>
                                {freq.badge && (
                                  <span className="absolute -top-2 right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                    {freq.badge}
                                  </span>
                                )}
                                <p className="font-medium text-sm text-gray-900 dark:text-gray-50">{freq.label}</p>
                                {freq.discount && (
                                  <p className="text-xs text-green-600 dark:text-green-400">{freq.discount}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                        <p className="font-medium text-gray-900 dark:text-gray-50 mb-4">Your Booking</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Service</span>
                            <span className="text-gray-900 dark:text-gray-50">Standard Clean</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Size</span>
                            <span className="text-gray-900 dark:text-gray-50">3 bed / 2 bath</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Frequency</span>
                            <span className="text-green-600 dark:text-green-400">Biweekly</span>
                          </div>
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                            <div className="flex justify-between text-green-600 dark:text-green-400">
                              <span>Discount</span>
                              <span>-$14</span>
                            </div>
                            <div className="flex justify-between font-semibold text-lg mt-1">
                              <span className="text-gray-900 dark:text-gray-50">Total</span>
                              <span className="text-brand-600">$131</span>
                            </div>
                          </div>
                        </div>
                        <button className="w-full bg-brand-600 text-white py-3 rounded-xl mt-4 font-medium">
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
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                      app.vistrial.io/quotes
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Quotes</h2>
                      <p className="text-gray-500 dark:text-gray-400">Track and manage your quotes</p>
                    </div>
                    <button className="bg-brand-600 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2">
                      <RiFileTextLine className="w-4 h-4" />
                      New Quote
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Sent</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">12</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-4">
                      <p className="text-sm text-green-600 dark:text-green-400">Accepted</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">8</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-4">
                      <p className="text-sm text-amber-600 dark:text-amber-400">Pending</p>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">3</p>
                    </div>
                    <div className="bg-brand-50 dark:bg-brand-900/30 rounded-xl p-4">
                      <p className="text-sm text-brand-600 dark:text-brand-400">Revenue</p>
                      <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">$4,280</p>
                    </div>
                  </div>

                  {/* Quote List */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {[
                        { name: "John Smith", service: "Deep Clean", amount: "$220", status: "pending", followUp: "Day 3" },
                        { name: "Lisa Wang", service: "Move-Out", amount: "$380", status: "accepted", followUp: null },
                        { name: "Tom Brown", service: "Standard", amount: "$145", status: "sent", followUp: "Day 1" },
                      ].map((quote, i) => (
                        <div key={i} className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                {quote.name.split(" ").map(n => n[0]).join("")}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-50">{quote.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">{quote.service}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {quote.followUp && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full">
                                Follow-up: {quote.followUp}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              quote.status === "accepted" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                              quote.status === "pending" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" :
                              "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            }`}>
                              {quote.status}
                            </span>
                            <p className="font-semibold text-gray-900 dark:text-gray-50">{quote.amount}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Logos / Social Proof */}
      <section className="py-12 border-y border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-center text-gray-500 dark:text-gray-400 mb-6">Trusted by 500+ home service businesses</p>
          <div className="flex items-center justify-center gap-12 opacity-50">
            {["SparkleClean", "TidyHome", "FreshStart", "CleanSweep", "ProShine"].map((name) => (
              <span key={name} className="text-xl font-bold text-gray-400">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-white dark:bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-4">
              Everything you need to book and retain
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              One platform. Booking, billing, and customer management.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: RiGlobalLine,
                title: "Embeddable Booking",
                description: "Add your booking page to any website with one line of code.",
                color: "brand",
              },
              {
                icon: RiLoopLeftLine,
                title: "Membership Billing",
                description: "Convert one-time bookings into recurring revenue.",
                color: "green",
              },
              {
                icon: RiTeamLine,
                title: "Customer Portal",
                description: "Customers manage their own bookings and memberships.",
                color: "blue",
              },
              {
                icon: RiMoneyDollarCircleLine,
                title: "Instant Quotes",
                description: "Create quotes with built-in profit calculator.",
                color: "amber",
              },
              {
                icon: RiMessage2Line,
                title: "SMS Notifications",
                description: "Automated texts for confirmations and reminders.",
                color: "pink",
              },
              {
                icon: RiBarChart2Line,
                title: "Dashboard & Reports",
                description: "See your bookings, revenue, and metrics at a glance.",
                color: "gray",
              },
            ].map((feature) => (
              <div key={feature.title} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6">
                <div className={`w-12 h-12 bg-${feature.color}-100 dark:bg-${feature.color}-900/30 rounded-xl flex items-center justify-center mb-4`}>
                  <feature.icon className={`w-6 h-6 text-${feature.color}-600 dark:text-${feature.color}-400`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-4">
              Simple pricing that scales with you
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Pay for what you use. No monthly minimums until you grow.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-8 text-center border-b border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400 mb-2">Per active recurring member</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-gray-900 dark:text-gray-50">$5</span>
                <span className="text-gray-500 dark:text-gray-400">/month</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                + Stripe fees (2.9% + 30¢) passed through
              </p>
            </div>

            <div className="p-8">
              <p className="font-medium text-gray-900 dark:text-gray-50 mb-4">What&apos;s included:</p>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  "Embeddable booking page",
                  "Shareable booking link",
                  "Membership billing (Stripe)",
                  "Customer portal",
                  "Instant quotes + follow-up",
                  "SMS notifications",
                  "Dashboard & reports",
                  "Unlimited one-time bookings",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <RiCheckLine className="w-5 h-5 text-green-500" />
                    <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/signup"
                className="block w-full bg-brand-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-brand-700 transition-colors text-center"
              >
                Start Free Trial
              </Link>
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-3">
                First 10 members free forever · No credit card required
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-br from-brand-600 to-brand-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to stop losing customers?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Set up your booking page in 10 minutes. Start converting one-time customers 
            into recurring members today.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-white text-brand-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-colors"
          >
            Get Started Free
            <RiArrowRightLine className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Image
                src="/Untitled design (2).png"
                alt="Vistrial"
                width={32}
                height={32}
                className="rounded-lg"
                unoptimized
              />
              <span className="font-bold text-xl text-gray-900 dark:text-gray-50">Vistrial</span>
            </div>
            <div className="flex items-center gap-8 text-sm text-gray-500 dark:text-gray-400">
              <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300">Privacy</a>
              <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300">Terms</a>
              <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300">Support</a>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              © 2026 Vistrial. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
