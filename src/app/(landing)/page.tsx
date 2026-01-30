"use client"

/**
 * Vistrial Landing Page
 * Marketing page for access.vistrial.io
 */

import { useState } from "react"
import Link from "next/link"
import {
  RiCalendarLine,
  RiMessage2Line,
  RiLoopLeftLine,
  RiFlashlightLine,
  RiCheckLine,
  RiArrowRightLine,
  RiPlayLine,
  RiStarFill,
  RiTeamLine,
  RiMoneyDollarCircleLine,
  RiGlobalLine,
  RiCodeLine,
  RiBarChart2Line,
} from "@remixicon/react"
export default function LandingPage() {
  const [, setShowDemo] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center">
              <RiCalendarLine className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">Vistrial</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-600 hover:text-gray-900">Features</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</a>
            <a href="#demo" className="text-gray-600 hover:text-gray-900">Demo</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium">
              Log in
            </Link>
            <Link
              href="/signup"
              className="bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <RiFlashlightLine className="w-4 h-4" />
            Built for cleaning companies
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
            <Link
              href="/signup"
              className="w-full sm:w-auto bg-brand-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
            >
              Start Free Trial
              <RiArrowRightLine className="w-5 h-5" />
            </Link>
            <button
              onClick={() => setShowDemo(true)}
              className="w-full sm:w-auto border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:border-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <RiPlayLine className="w-5 h-5" />
              Watch Demo
            </button>
          </div>

          <p className="text-sm text-gray-500">
            No credit card required · Free for first 10 members · Cancel anytime
          </p>
        </div>

        {/* Hero Image - Booking Interface Preview */}
        <div className="max-w-5xl mx-auto mt-16">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none" />
            <div className="bg-gray-100 rounded-2xl p-4 shadow-2xl">
              <div className="bg-white rounded-xl overflow-hidden border">
                {/* Mock Booking Interface */}
                <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white p-6">
                  <h2 className="text-xl font-bold">Sparkle Clean Co.</h2>
                  <p className="text-white/80">Book your cleaning in 60 seconds</p>
                </div>
                <div className="p-6 grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-4">
                    <div className="p-4 border rounded-lg">
                      <p className="font-medium text-gray-900 mb-2">Select Service</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 border-2 border-brand-600 bg-brand-50 rounded-lg">
                          <p className="font-medium">Standard Clean</p>
                          <p className="text-sm text-gray-500">From $120</p>
                        </div>
                        <div className="p-3 border rounded-lg">
                          <p className="font-medium">Deep Clean</p>
                          <p className="text-sm text-gray-500">From $180</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="font-medium text-gray-900 mb-2">Choose Date &amp; Time</p>
                      <div className="grid grid-cols-7 gap-1 text-center text-sm">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div key={i} className="text-gray-400 py-1">{d}</div>
                        ))}
                        {[...Array(31)].map((_, i) => (
                          <div
                            key={i}
                            className={`py-2 rounded ${i === 14 ? "bg-brand-600 text-white" : "hover:bg-gray-100"}`}
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="font-medium text-gray-900 mb-4">Your Booking</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Service</span>
                        <span>Standard Clean</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Size</span>
                        <span>3 bed / 2 bath</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Date</span>
                        <span>Feb 15, 2026</span>
                      </div>
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between font-semibold">
                          <span>Total</span>
                          <span>$145</span>
                        </div>
                      </div>
                    </div>
                    <button className="w-full bg-brand-600 text-white py-3 rounded-lg mt-4 font-medium">
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos / Social Proof */}
      <section className="py-12 border-y bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-center text-gray-500 mb-6">Trusted by 50+ cleaning companies</p>
          <div className="flex items-center justify-center gap-12 opacity-50">
            {["SparkleClean", "TidyHome", "FreshStart", "CleanSweep", "ProShine"].map((name) => (
              <span key={name} className="text-xl font-bold text-gray-400">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Stop losing customers after the first clean
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Most cleaning companies lose 70% of customers after one job. They book once, you never hear from them again.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✕</span>
                  </div>
                  <p className="text-gray-600">Customers forget to rebook</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✕</span>
                  </div>
                  <p className="text-gray-600">No easy way to become a recurring client</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✕</span>
                  </div>
                  <p className="text-gray-600">You&apos;re constantly chasing new leads</p>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-brand-50 to-brand-100 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Vistrial converts one-time into recurring
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <RiCheckLine className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-gray-700">Membership upsell built into booking flow</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <RiCheckLine className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-gray-700">Auto-billing so they never have to think</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <RiCheckLine className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-gray-700">Customer portal to pause, not cancel</p>
                </div>
              </div>
              <div className="mt-6 p-4 bg-white rounded-lg">
                <p className="text-sm text-gray-500">Average conversion to recurring</p>
                <p className="text-3xl font-bold text-brand-600">34%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-gray-50">
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
            {/* Feature 1 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mb-4">
                <RiGlobalLine className="w-6 h-6 text-brand-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Embeddable Booking
              </h3>
              <p className="text-gray-600 mb-4">
                Add your booking page to any website with one line of code. Or share a direct link.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Custom colors &amp; branding
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Mobile responsive
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Real-time availability
                </li>
              </ul>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <RiLoopLeftLine className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Membership Billing
              </h3>
              <p className="text-gray-600 mb-4">
                Convert one-time bookings into recurring revenue. Automated billing via Stripe.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Weekly/biweekly/monthly plans
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Auto-retry failed payments
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Pause/resume (not cancel)
                </li>
              </ul>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <RiTeamLine className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Customer Portal
              </h3>
              <p className="text-gray-600 mb-4">
                Customers manage their own bookings, pause memberships, and update payment.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Passwordless login (SMS PIN)
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Reschedule appointments
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  View payment history
                </li>
              </ul>
            </div>

            {/* Feature 4 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <RiMoneyDollarCircleLine className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Instant Quotes
              </h3>
              <p className="text-gray-600 mb-4">
                Create quotes with built-in profit calculator. Auto follow-up until they book.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Profit margin alerts
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Auto follow-up (Day 1,3,5,7)
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Accept → instant booking
                </li>
              </ul>
            </div>

            {/* Feature 5 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center mb-4">
                <RiMessage2Line className="w-6 h-6 text-pink-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                SMS Notifications
              </h3>
              <p className="text-gray-600 mb-4">
                Automated texts for confirmations, reminders, and follow-ups.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Booking confirmations
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Day-before reminders
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Review requests
                </li>
              </ul>
            </div>

            {/* Feature 6 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                <RiBarChart2Line className="w-6 h-6 text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Dashboard &amp; Reporting
              </h3>
              <p className="text-gray-600 mb-4">
                See your bookings, revenue, and membership metrics at a glance.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Today&apos;s schedule
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Revenue tracking
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Member churn alerts
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Embed Options */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Two ways to get bookings
            </h2>
            <p className="text-lg text-gray-600">
              Embed on your website or share a direct link
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Option 1: Embed */}
            <div className="border-2 border-gray-200 rounded-2xl p-8 hover:border-brand-300 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
                  <RiCodeLine className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Embed Widget</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Add one line of code to your website. The booking form appears inline or as a popup.
              </p>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                <pre>{`<script src="https://embed.vistrial.io/embed.js" 
  data-business="your-slug">
</script>`}</pre>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Works with any website
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Matches your brand colors
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Popup or inline mode
                </li>
              </ul>
            </div>

            {/* Option 2: Link */}
            <div className="border-2 border-gray-200 rounded-2xl p-8 hover:border-brand-300 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <RiGlobalLine className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Direct Link</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Share your booking page link anywhere — social media, texts, emails, or your bio.
              </p>
              <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm text-gray-600 flex items-center justify-between">
                <span>book.vistrial.io/your-company</span>
                <button className="text-brand-600 hover:text-brand-700">Copy</button>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Your own branded page
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Add to Instagram bio
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Text to leads
                </li>
              </ul>
            </div>
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

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-8 text-center border-b">
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
                  "Custom branding",
                  "Priority support",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <RiCheckLine className="w-5 h-5 text-green-500" />
                    <span className="text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-gray-50 border-t">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="font-semibold text-gray-900">Example</p>
                  <p className="text-sm text-gray-500">20 recurring members</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">$100/mo</p>
                  <p className="text-sm text-gray-500">That&apos;s $5 × 20 members</p>
                </div>
              </div>
              <Link
                href="/signup"
                className="block w-full bg-brand-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-brand-700 transition-colors text-center"
              >
                Start Free Trial
              </Link>
              <p className="text-center text-sm text-gray-500 mt-3">
                First 10 members free forever
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            {[...Array(5)].map((_, i) => (
              <RiStarFill key={i} className="w-6 h-6 text-amber-400" />
            ))}
          </div>
          <blockquote className="text-2xl text-gray-700 mb-6">
            &quot;Before Vistrial, 80% of my customers were one-time. Now 40% of new bookings 
            convert to weekly or biweekly memberships. My revenue is finally predictable.&quot;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 bg-gray-200 rounded-full" />
            <div className="text-left">
              <p className="font-semibold text-gray-900">Maria Santos</p>
              <p className="text-sm text-gray-500">Sparkle Clean Co, Austin TX</p>
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
          <p className="text-white/60 text-sm mt-4">
            No credit card required · First 10 members free
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center">
                <RiCalendarLine className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900">Vistrial</span>
            </div>
            <div className="flex items-center gap-8 text-sm text-gray-500">
              <a href="#" className="hover:text-gray-700">Privacy</a>
              <a href="#" className="hover:text-gray-700">Terms</a>
              <a href="#" className="hover:text-gray-700">Support</a>
              <a href="#" className="hover:text-gray-700">Contact</a>
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
