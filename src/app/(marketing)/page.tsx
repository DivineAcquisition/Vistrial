// ============================================
// LANDING PAGE
// High-converting landing page for Vistrial
// ============================================

import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  RiFlashlightLine,
  RiArrowRightLine,
  RiCheckLine,
  RiMessage2Line,
  RiPhoneLine,
  RiGroupLine,
  RiLineChartLine,
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiShieldCheckLine,
  RiPlayCircleLine,
  RiStarFill,
  RiBarChartBoxLine,
  RiCalendarLine,
  RiRefreshLine,
  RiCrosshair2Line,
  RiRobot2Line,
  RiSparklingLine,
} from '@remixicon/react';
import { HeroAnimation } from '@/components/marketing/hero-animation';
import { StatsCounter } from '@/components/marketing/stats-counter';
import { TestimonialCarousel } from '@/components/marketing/testimonial-carousel';
import { PricingCards } from '@/components/marketing/pricing-cards';
import { DemoVideo } from '@/components/marketing/demo-video';
import { ROICalculator } from '@/components/marketing/roi-calculator';

export const metadata: Metadata = {
  title: 'Vistrial - Turn Dormant Leads Into Revenue | Automated Reactivation for Home Services',
  description:
    'Stop leaving money on the table. Vistrial automatically reactivates your old customers with SMS and voice campaigns. Home service businesses see 15-30% of dormant leads convert. Start free.',
  openGraph: {
    title: 'Vistrial - Turn Dormant Leads Into Revenue',
    description:
      'Automated SMS and voice campaigns that bring back your old customers. Built for home service businesses.',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <>
      {/* ==================== HERO SECTION ==================== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/50 to-white pb-24 pt-20">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        
        {/* Gradient orbs */}
        <div className="absolute -right-64 -top-64 h-[500px] w-[500px] rounded-full bg-brand-400/20 blur-3xl" />
        <div className="absolute -bottom-64 -left-64 h-[500px] w-[500px] rounded-full bg-brand-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <Badge variant="default" className="mb-6 gap-1.5 px-3 py-1.5">
              <RiSparklingLine className="h-3.5 w-3.5" />
              Built specifically for home service businesses
            </Badge>

            {/* Headline */}
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Your old customers are
              <span className="gradient-text-brand"> waiting to hear from you.</span>
            </h1>

            {/* Subheadline */}
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
              That database of past customers sitting in your CRM?{' '}
              <strong className="font-semibold text-gray-900">15-30% of them will book again</strong> if you just reach out. Vistrial does it automatically with SMS and voice drops.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/signup">
                <Button size="xl" className="text-base">
                  Start Free Trial
                  <RiArrowRightLine className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="xl" variant="outline" className="text-base">
                  <RiPlayCircleLine className="mr-2 h-5 w-5" />
                  Watch 2-Min Demo
                </Button>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <RiCheckLine className="h-4 w-4 text-green-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <RiCheckLine className="h-4 w-4 text-green-600" />
                <span>Setup in under 10 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <RiCheckLine className="h-4 w-4 text-green-600" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>

          {/* Hero Image/Animation */}
          <div className="relative mt-16">
            <HeroAnimation />
          </div>
        </div>
      </section>

      {/* ==================== PROBLEM/PAIN SECTION ==================== */}
      <section className="border-y border-gray-200 bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-900">
              You&apos;re sitting on a goldmine of leads you&apos;ve already paid for.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Most home service businesses have hundreds (or thousands) of past customers who haven&apos;t booked in 6+ months. Here&apos;s why that&apos;s costing you:
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="bg-white ring-1 ring-red-100">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 ring-1 ring-inset ring-red-600/10">
                  <RiMoneyDollarCircleLine className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">$500+ to acquire a new customer</h3>
                <p className="text-gray-600">
                  Between Google Ads, Thumbtack, and Angi leads, you&apos;re paying a fortune for new customers. Meanwhile, your existing database costs $0 to reach.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white ring-1 ring-amber-100">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-600/10">
                  <RiTimeLine className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">No time for manual follow-ups</h3>
                <p className="text-gray-600">
                  You know you should reach out to old customers, but who has time to send hundreds of texts manually? The work piles up and never gets done.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white ring-1 ring-orange-100">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 ring-1 ring-inset ring-orange-600/10">
                  <RiGroupLine className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Competitors are winning them back</h3>
                <p className="text-gray-600">
                  Every month you don&apos;t reach out, someone else is. Your old customers don&apos;t forget they need cleaning/HVAC/plumbing—they just call whoever contacts them first.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ==================== SOLUTION SECTION ==================== */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <Badge variant="default" className="mb-4">The Solution</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Automated reactivation that works while you sleep.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Upload your customer list, choose a campaign, and watch the bookings roll in. Vistrial handles the outreach so you can focus on delivering great service.
            </p>
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="space-y-8">
              <FeatureItem
                icon={<RiMessage2Line className="h-6 w-6" />}
                title="Smart SMS Campaigns"
                description="Personalized text messages that feel human, not spammy. Automated sequences that follow up until they book or opt out."
              />
              <FeatureItem
                icon={<RiPhoneLine className="h-6 w-6" />}
                title="AI Voice Drops"
                description="Professional voicemails delivered directly to their inbox. No awkward phone calls, no playing phone tag. Just a friendly reminder you exist."
              />
              <FeatureItem
                icon={<RiRobot2Line className="h-6 w-6" />}
                title="AI Response Detection"
                description="Automatically detects positive responses vs. opt-outs. Routes hot leads to you instantly."
              />
              <FeatureItem
                icon={<RiBarChartBoxLine className="h-6 w-6" />}
                title="Revenue Attribution"
                description="Track exactly how much revenue each campaign generates. Know your ROI down to the penny."
              />
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-2xl bg-brand-gradient p-8 text-white shadow-2xl shadow-brand-600/20 ring-1 ring-inset ring-white/10">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                    <RiFlashlightLine className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Reactivation Campaign</p>
                    <p className="text-sm text-white/70">Running • 847 contacts</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl bg-white/10 p-4 ring-1 ring-inset ring-white/10">
                    <div className="mb-2 flex justify-between">
                      <span className="text-white/70">Messages Sent</span>
                      <span className="font-semibold">2,541</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full w-3/4 rounded-full bg-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-white/10 p-4 text-center ring-1 ring-inset ring-white/10">
                      <p className="text-2xl font-bold">127</p>
                      <p className="text-sm text-white/70">Responses</p>
                    </div>
                    <div className="rounded-xl bg-white/10 p-4 text-center ring-1 ring-inset ring-white/10">
                      <p className="text-2xl font-bold">43</p>
                      <p className="text-sm text-white/70">Bookings</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-green-500/20 p-4 ring-1 ring-inset ring-green-400/30">
                    <div className="flex items-center gap-2">
                      <RiLineChartLine className="h-5 w-5 text-green-300" />
                      <span className="font-semibold">$12,470 Revenue Generated</span>
                    </div>
                    <p className="mt-1 text-sm text-white/70">From $127 in message costs</p>
                  </div>
                </div>
              </div>

              {/* Floating notification */}
              <div className="absolute -bottom-6 -left-6 animate-pulse rounded-xl border border-gray-200 bg-white p-4 shadow-lg ring-1 ring-gray-900/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 ring-1 ring-inset ring-green-600/20">
                    <RiCheckLine className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">New Booking!</p>
                    <p className="text-xs text-gray-500">Sarah M. just booked a cleaning</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how-it-works" className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <Badge variant="default" className="mb-4">How It Works</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Up and running in 10 minutes. Seriously.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              No complicated setup. No IT department needed. If you can upload a spreadsheet, you can use Vistrial.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="relative">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-4 ring-brand-600/20">
                  1
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Upload Your Contacts</h3>
              </div>
              <p className="ml-16 text-gray-600">
                Export your customer list from whatever you use now—Jobber, Housecall Pro, ServiceTitan, or just a spreadsheet. Drag, drop, done.
              </p>
              <div className="absolute right-0 top-6 hidden h-0.5 w-full bg-gradient-to-r from-brand-600 to-transparent md:block" style={{ left: '100%', width: 'calc(100% - 48px)' }} />
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-4 ring-brand-600/20">
                  2
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Pick a Campaign</h3>
              </div>
              <p className="ml-16 text-gray-600">
                Choose from proven templates: &ldquo;We Miss You&rdquo; reactivation, seasonal promotions, review requests. Or build your own in our drag-and-drop editor.
              </p>
              <div className="absolute right-0 top-6 hidden h-0.5 w-full bg-gradient-to-r from-brand-600 to-transparent md:block" style={{ left: '100%', width: 'calc(100% - 48px)' }} />
            </div>

            {/* Step 3 */}
            <div>
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-4 ring-brand-600/20">
                  3
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Watch Bookings Roll In</h3>
              </div>
              <p className="ml-16 text-gray-600">
                Sit back while Vistrial sends messages on autopilot. Get notified when someone&apos;s interested. Track revenue from your dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SOCIAL PROOF / STATS ==================== */}
      <section className="bg-brand-gradient py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <StatsCounter />
        </div>
      </section>

      {/* ==================== FEATURES GRID ==================== */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <Badge variant="default" className="mb-4">Features</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Built by people who understand home service businesses. Every feature exists because it drives revenue.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<RiMessage2Line className="h-6 w-6" />}
              title="Two-Way SMS Inbox"
              description="Reply to customers directly from Vistrial. Full conversation history, quick templates, team assignment."
            />
            <FeatureCard
              icon={<RiPhoneLine className="h-6 w-6" />}
              title="AI Voice Drops"
              description="Professional voicemails powered by AI. Natural-sounding, personalized, delivered without ringing."
            />
            <FeatureCard
              icon={<RiCrosshair2Line className="h-6 w-6" />}
              title="Smart Segmentation"
              description="Target customers by last job date, service type, value, or any custom field. Right message, right person."
            />
            <FeatureCard
              icon={<RiRefreshLine className="h-6 w-6" />}
              title="Multi-Step Workflows"
              description="Automated sequences: SMS → wait 3 days → voice drop → wait 7 days → final SMS. Set it and forget it."
            />
            <FeatureCard
              icon={<RiBarChartBoxLine className="h-6 w-6" />}
              title="Revenue Attribution"
              description="Track which campaigns generate the most revenue. Know your ROI for every dollar spent."
            />
            <FeatureCard
              icon={<RiCalendarLine className="h-6 w-6" />}
              title="Smart Send Times"
              description="Messages go out during business hours in your customer's timezone. No 3am texts."
            />
            <FeatureCard
              icon={<RiShieldCheckLine className="h-6 w-6" />}
              title="TCPA Compliant"
              description="Automatic opt-out handling, consent tracking, and compliance built in. Stay legal, worry-free."
            />
            <FeatureCard
              icon={<RiStarFill className="h-6 w-6" />}
              title="Review Requests"
              description="Automatically ask happy customers for Google reviews. Build your reputation on autopilot."
            />
            <FeatureCard
              icon={<RiGroupLine className="h-6 w-6" />}
              title="Team Access"
              description="Invite your team with role-based permissions. Office staff can reply, owners see revenue."
            />
          </div>
        </div>
      </section>

      {/* ==================== DEMO VIDEO ==================== */}
      <section id="demo" className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge variant="default" className="mb-4">See It In Action</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Watch Vistrial generate $8,000 in 2 minutes.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              See exactly how easy it is to upload contacts, launch a campaign, and track your results.
            </p>
          </div>

          <DemoVideo />
        </div>
      </section>

      {/* ==================== ROI CALCULATOR ==================== */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge variant="default" className="mb-4">Calculate Your ROI</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              See how much revenue you&apos;re leaving on the table.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Plug in your numbers. Most home service businesses see 10-30x ROI.
            </p>
          </div>

          <ROICalculator />
        </div>
      </section>

      {/* ==================== TESTIMONIALS ==================== */}
      <section className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge variant="default" className="mb-4">Success Stories</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Home service businesses love Vistrial.
            </h2>
          </div>

          <TestimonialCarousel />
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge variant="default" className="mb-4">Pricing</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Simple pricing. Unlimited campaigns.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Pay for your contact limit, then just pay for messages sent. No hidden fees, no long-term contracts.
            </p>
          </div>

          <PricingCards />
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section id="faq" className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge variant="default" className="mb-4">FAQ</Badge>
            <h2 className="text-3xl font-bold text-gray-900">
              Common questions, straight answers.
            </h2>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                How is this different from Mailchimp or other email tools?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Email open rates for home services are around 15-20%. SMS open rates are 98%. Vistrial focuses on SMS and voice—the channels that actually get responses. Plus, we&apos;re built specifically for reactivation campaigns, not generic marketing.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                Is this legal? What about spam laws?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Yes, 100% legal when used properly. Vistrial is built with TCPA compliance in mind. We automatically handle opt-outs, respect quiet hours, and provide consent tracking. You should have prior business relationships with the contacts you&apos;re messaging (your past customers), which is the safest form of SMS marketing.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                How do voice drops work? Do I record myself?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                No recording needed! You write the script, our AI generates a natural-sounding voice message. It&apos;s delivered as a ringless voicemail—goes directly to their voicemail without their phone ringing. Professional, non-intrusive, highly effective.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                What kind of results can I expect?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Most home service businesses see 5-15% response rates and 2-5% booking rates from dormant customer reactivation campaigns. On a list of 1,000 old customers, that&apos;s 20-50 new bookings. At an average job value of $250, that&apos;s $5,000-$12,500 in revenue from a single campaign.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                Can I integrate with my existing software?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Vistrial works via CSV import, which means it works with any software that can export contacts: Jobber, Housecall Pro, ServiceTitan, ServiceM8, or even just a spreadsheet. We&apos;re also building direct integrations with popular platforms.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                What happens when someone replies?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Replies come into your Vistrial inbox where you can respond directly. Our AI categorizes responses (interested, not interested, question, opt-out) so you can prioritize hot leads. You can also get notifications via email or SMS when someone responds.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="bg-brand-gradient py-24 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Stop paying for new customers when your old ones are waiting.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-white/80">
            Every day you wait is another day your competitors are reaching out to your past customers. Start your free trial in the next 5 minutes.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/signup">
              <Button size="xl" variant="secondary" className="bg-white text-brand-600 hover:bg-white/90">
                Start Free Trial
                <RiArrowRightLine className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <p className="text-sm text-white/60">
              Free 14-day trial • No credit card required
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

// Feature Item Component (for inline features)
function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-gray-600">{description}</p>
      </div>
    </div>
  );
}

// Feature Card Component (for grid)
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-gray-600">{description}</p>
      </CardContent>
    </Card>
  );
}
