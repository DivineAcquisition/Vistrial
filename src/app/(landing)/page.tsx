"use client"

/**
 * Vistrial Landing Page
 * Marketing page with app visuals - White theme
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
  RiSparklingLine,
} from "@remixicon/react"

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "booking" | "quotes">("dashboard")

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
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
            <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#demo" className="text-gray-600 hover:text-gray-900 transition-colors">Demo</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium transition-colors">
              Log in
            </Link>
            <a
              href="https://app.vistrial.io/onboarding"
              className="bg-gradient-to-r from-brand-500 to-brand-600 text-white px-5 py-2.5 rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:scale-[1.02]"
            >
              Get Started Free
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-[20%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-brand-400/10 to-transparent blur-3xl" />
          <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-gradient-to-br from-indigo-400/10 to-transparent blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-brand-100">
            <RiFlashlightLine className="w-4 h-4" />
            Built for home service pros
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Book more jobs.<br />
            Keep more customers.
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            A booking page that converts one-time customers into recurring members. 
            Embed it on your site or share a link. Start getting bookings in 10 minutes.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="https://app.vistrial.io/onboarding"
              className="w-full sm:w-auto bg-gradient-to-r from-brand-500 to-brand-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-brand-600 hover:to-brand-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-brand-500/25 hover:shadow-2xl hover:shadow-brand-500/30 hover:scale-[1.02]"
            >
              <RiSparklingLine className="w-5 h-5" />
              Start Free Trial
              <RiArrowRightLine className="w-5 h-5" />
            </a>
            <a
              href="#demo"
              className="w-full sm:w-auto border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <RiPlayLine className="w-5 h-5" />
              See It In Action
            </a>
          </div>

          <p className="text-sm text-gray-500">
            No credit card required · Free for first 10 members · Cancel anytime
          </p>
        </div>
      </section>

      {/* App Screenshots Demo Section */}
      <section id="demo" className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              See Vistrial in action
            </h2>
            <p className="text-lg text-gray-600">
              Everything you need to run your business, in one place
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex justify-center gap-2 mb-8">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "dashboard"
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <RiDashboardLine className="w-5 h-5" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("booking")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "booking"
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <RiCalendarLine className="w-5 h-5" />
              Booking Page
            </button>
            <button
              onClick={() => setActiveTab("quotes")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "quotes"
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <RiFileTextLine className="w-5 h-5" />
              Quotes
            </button>
          </div>

          {/* Screenshot Display */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-t from-gray-50 via-transparent to-transparent z-10 pointer-events-none" />
            
            {/* Dashboard Preview */}
            {activeTab === "dashboard" && (
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                {/* Browser Chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white rounded-lg px-4 py-1.5 text-sm text-gray-500 border border-gray-200">
                      app.vistrial.io/dashboard
                    </div>
                  </div>
                </div>
                
                {/* Dashboard Content */}
                <div className="p-6">
                  <div className="flex gap-6">
                    {/* Sidebar Mock */}
                    <div className="w-48 flex-shrink-0 space-y-2">
                      <div className="flex items-center gap-3 px-3 py-2 bg-brand-50 rounded-lg border border-brand-100">
                        <RiDashboardLine className="w-5 h-5 text-brand-600" />
                        <span className="font-medium text-brand-700">Dashboard</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <RiCalendarLine className="w-5 h-5" />
                        <span>Bookings</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <RiTeamLine className="w-5 h-5" />
                        <span>Customers</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <RiFileTextLine className="w-5 h-5" />
                        <span>Quotes</span>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 space-y-6">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">Welcome back, Maria!</h2>
                        <p className="text-gray-500">Here&apos;s what&apos;s happening today.</p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-brand-50 rounded-xl p-4 border border-brand-100">
                          <p className="text-sm text-brand-600">Today</p>
                          <p className="text-2xl font-bold text-brand-700">5</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                          <p className="text-sm text-green-600">This Week</p>
                          <p className="text-2xl font-bold text-green-700">23</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                          <p className="text-sm text-amber-600">Members</p>
                          <p className="text-2xl font-bold text-amber-700">47</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                          <p className="text-sm text-blue-600">Revenue</p>
                          <p className="text-2xl font-bold text-blue-700">$8,420</p>
                        </div>
                      </div>

                      {/* Today's Schedule */}
                      <div className="border border-gray-200 rounded-xl">
                        <div className="p-4 border-b border-gray-200">
                          <h3 className="font-semibold text-gray-900">Today&apos;s Schedule</h3>
                        </div>
                        <div className="divide-y divide-gray-200">
                          {[
                            { time: "9:00 AM", name: "Sarah Johnson", type: "Deep Clean", price: "$185" },
                            { time: "11:00 AM", name: "Mike Chen", type: "Standard", price: "$145" },
                            { time: "2:00 PM", name: "Emily Davis", type: "Move-Out", price: "$320" },
                          ].map((booking, i) => (
                            <div key={i} className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <RiCalendarLine className="w-5 h-5 text-gray-500" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{booking.name}</p>
                                  <p className="text-sm text-gray-500">{booking.time} · {booking.type}</p>
                                </div>
                              </div>
                              <p className="font-semibold text-gray-900">{booking.price}</p>
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
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white rounded-lg px-4 py-1.5 text-sm text-gray-500 border border-gray-200">
                      book.vistrial.io/sparkle-clean
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="max-w-3xl mx-auto">
                    <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white p-6 rounded-t-xl -mx-6 -mt-6 mb-6">
                      <h2 className="text-xl font-bold">Sparkle Clean Co.</h2>
                      <p className="text-white/80">Book your cleaning in 60 seconds</p>
                    </div>

                    <div className="flex items-center justify-between mb-6">
                      {["Service", "Property", "Schedule", "Contact", "Book"].map((step, i) => (
                        <div key={step} className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            i === 0 ? "bg-brand-600 text-white" : 
                            i < 2 ? "bg-green-500 text-white" : 
                            "bg-gray-200 text-gray-500"
                          }`}>
                            {i < 2 ? <RiCheckLine className="w-4 h-4" /> : i + 1}
                          </div>
                          <span className="hidden sm:inline text-sm text-gray-500">{step}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 space-y-4">
                        <div className="p-4 border border-gray-200 rounded-xl">
                          <p className="font-medium text-gray-900 mb-3">Select Service</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 border-2 border-brand-500 bg-brand-50 rounded-xl">
                              <p className="font-medium text-gray-900">Standard Clean</p>
                              <p className="text-sm text-gray-500">From $120</p>
                            </div>
                            <div className="p-3 border border-gray-200 rounded-xl hover:border-gray-300">
                              <p className="font-medium text-gray-900">Deep Clean</p>
                              <p className="text-sm text-gray-500">From $180</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-4 border border-gray-200 rounded-xl">
                          <p className="font-medium text-gray-900 mb-3">How often?</p>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: "Weekly", discount: "15% off", badge: "Best" },
                              { label: "Biweekly", discount: "10% off", badge: null },
                              { label: "Monthly", discount: "5% off", badge: null },
                              { label: "One-time", discount: null, badge: null },
                            ].map((freq) => (
                              <div key={freq.label} className={`p-3 border rounded-xl text-center relative ${
                                freq.label === "Biweekly" ? "border-brand-500 bg-brand-50" : "border-gray-200"
                              }`}>
                                {freq.badge && (
                                  <span className="absolute -top-2 right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                    {freq.badge}
                                  </span>
                                )}
                                <p className="font-medium text-sm text-gray-900">{freq.label}</p>
                                {freq.discount && (
                                  <p className="text-xs text-green-600">{freq.discount}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="font-medium text-gray-900 mb-4">Your Booking</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Service</span>
                            <span className="text-gray-900">Standard Clean</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Size</span>
                            <span className="text-gray-900">3 bed / 2 bath</span>
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
                            <div className="flex justify-between font-semibold text-lg mt-1">
                              <span className="text-gray-900">Total</span>
                              <span className="text-brand-600">$131</span>
                            </div>
                          </div>
                        </div>
                        <button className="w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white py-3 rounded-xl mt-4 font-medium shadow-lg shadow-brand-500/25">
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
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white rounded-lg px-4 py-1.5 text-sm text-gray-500 border border-gray-200">
                      app.vistrial.io/quotes
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Quotes</h2>
                      <p className="text-gray-500">Track and manage your quotes</p>
                    </div>
                    <button className="bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-brand-500/25">
                      <RiFileTextLine className="w-4 h-4" />
                      New Quote
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-sm text-gray-500">Sent</p>
                      <p className="text-2xl font-bold text-gray-900">12</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                      <p className="text-sm text-green-600">Accepted</p>
                      <p className="text-2xl font-bold text-green-700">8</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                      <p className="text-sm text-amber-600">Pending</p>
                      <p className="text-2xl font-bold text-amber-700">3</p>
                    </div>
                    <div className="bg-brand-50 rounded-xl p-4 border border-brand-100">
                      <p className="text-sm text-brand-600">Revenue</p>
                      <p className="text-2xl font-bold text-brand-700">$4,280</p>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-200">
                      {[
                        { name: "John Smith", service: "Deep Clean", amount: "$220", status: "pending", followUp: "Day 3" },
                        { name: "Lisa Wang", service: "Move-Out", amount: "$380", status: "accepted", followUp: null },
                        { name: "Tom Brown", service: "Standard", amount: "$145", status: "sent", followUp: "Day 1" },
                      ].map((quote, i) => (
                        <div key={i} className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-600">
                                {quote.name.split(" ").map(n => n[0]).join("")}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{quote.name}</p>
                              <p className="text-sm text-gray-500">{quote.service}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {quote.followUp && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                Follow-up: {quote.followUp}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              quote.status === "accepted" ? "bg-green-100 text-green-700" :
                              quote.status === "pending" ? "bg-amber-100 text-amber-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {quote.status}
                            </span>
                            <p className="font-semibold text-gray-900">{quote.amount}</p>
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

      {/* Social Proof */}
      <section className="py-12 border-y border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-center text-gray-500 mb-6">Trusted by 500+ home service businesses</p>
          <div className="flex items-center justify-center gap-12 opacity-40">
            {["SparkleClean", "TidyHome", "FreshStart", "CleanSweep", "ProShine"].map((name) => (
              <span key={name} className="text-xl font-bold text-gray-400">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything you need to book and retain
            </h2>
            <p className="text-lg text-gray-600">
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
              <div key={feature.title} className="bg-gray-50 rounded-xl p-6 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className={`w-12 h-12 bg-${feature.color}-100 rounded-xl flex items-center justify-center mb-4`}>
                  <feature.icon className={`w-6 h-6 text-${feature.color}-600`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Simple pricing that scales with you
            </h2>
            <p className="text-lg text-gray-600">
              Pay for what you use. No monthly minimums until you grow.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
            <div className="p-8 text-center border-b border-gray-200">
              <p className="text-gray-500 mb-2">Per active recurring member</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-gray-900">$5</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                + Stripe fees (2.9% + 30¢) passed through
              </p>
            </div>

            <div className="p-8">
              <p className="font-medium text-gray-900 mb-4">What&apos;s included:</p>
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
                    <span className="text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-gray-50 border-t border-gray-200">
              <a
                href="https://app.vistrial.io/onboarding"
                className="block w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white py-4 rounded-xl font-semibold text-lg hover:from-brand-600 hover:to-brand-700 transition-all text-center shadow-lg shadow-brand-500/25 hover:shadow-xl"
              >
                Start Free Trial
              </a>
              <p className="text-center text-sm text-gray-500 mt-3">
                First 10 members free forever · No credit card required
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-br from-brand-500 to-brand-600 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-[20%] w-[400px] h-[400px] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 right-[20%] w-[300px] h-[300px] rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to stop losing customers?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Set up your booking page in 10 minutes. Start converting one-time customers 
            into recurring members today.
          </p>
          <a
            href="https://app.vistrial.io/onboarding"
            className="inline-flex items-center gap-2 bg-white text-brand-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-all shadow-xl hover:scale-[1.02]"
          >
            Get Started Free
            <RiArrowRightLine className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-100 bg-white">
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
              <span className="font-bold text-xl text-gray-900">Vistrial</span>
            </div>
            <div className="flex items-center gap-8 text-sm text-gray-500">
              <a href="#" className="hover:text-gray-700">Privacy</a>
              <a href="#" className="hover:text-gray-700">Terms</a>
              <a href="#" className="hover:text-gray-700">Support</a>
            </div>
            <p className="text-sm text-gray-500">
              © 2026 Vistrial. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
