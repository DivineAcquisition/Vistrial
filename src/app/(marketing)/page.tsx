// ============================================
// LANDING PAGE
// High-converting landing page for Vistrial
// ============================================

import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Zap,
  ArrowRight,
  CheckCircle,
  MessageSquare,
  Phone,
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  Shield,
  Play,
  Star,
  BarChart3,
  Calendar,
  RefreshCw,
  Target,
  Bot,
  Sparkles,
} from 'lucide-react';
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
      <section className="relative overflow-hidden hero-gradient pt-20 pb-32">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <Badge
              variant="outline"
              className="mb-6 px-4 py-1.5 text-sm border-brand-200 bg-brand-50 text-brand-700"
            >
              <Sparkles className="h-3.5 w-3.5 mr-2 text-brand-600" />
              Built specifically for home service businesses
            </Badge>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-gray-900">
              Your old customers are
              <span className="gradient-text-brand"> waiting to hear from you.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              That database of past customers sitting in your CRM? <strong className="text-gray-900">15-30% of them will book again</strong> if you just reach out. Vistrial does it automatically with SMS and voice drops.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link href="/signup">
                <Button size="lg" className="text-lg px-8 h-12 bg-brand-600 hover:bg-brand-700">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="lg" variant="outline" className="text-lg px-8 h-12 border-gray-300 text-gray-700 hover:bg-gray-50">
                  <Play className="mr-2 h-5 w-5" />
                  Watch 2-Min Demo
                </Button>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>Setup in under 10 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>

          {/* Hero Image/Animation */}
          <div className="mt-16 relative">
            <HeroAnimation />
          </div>
        </div>
      </section>

      {/* ==================== PROBLEM/PAIN SECTION ==================== */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">
              You&apos;re sitting on a goldmine of leads you&apos;ve already paid for.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Most home service businesses have hundreds (or thousands) of past customers who haven&apos;t booked in 6+ months. Here&apos;s why that&apos;s costing you:
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-red-50/50 border-red-100">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <DollarSign className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">$500+ to acquire a new customer</h3>
                <p className="text-gray-600">
                  Between Google Ads, Thumbtack, and Angi leads, you&apos;re paying a fortune for new customers. Meanwhile, your existing database costs $0 to reach.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-orange-50/50 border-orange-100">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">No time for manual follow-ups</h3>
                <p className="text-gray-600">
                  You know you should reach out to old customers, but who has time to send hundreds of texts manually? The work piles up and never gets done.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-amber-50/50 border-amber-100">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">Competitors are winning them back</h3>
                <p className="text-gray-600">
                  Every month you don&apos;t reach out, someone else is. Your old customers don&apos;t forget they need cleaning/HVAC/plumbing—they just call whoever contacts them first.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ==================== SOLUTION SECTION ==================== */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">The Solution</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              Automated reactivation that works while you sleep.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Upload your customer list, choose a campaign, and watch the bookings roll in. Vistrial handles the outreach so you can focus on delivering great service.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-6 w-6 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">Smart SMS Campaigns</h3>
                  <p className="text-gray-600">
                    Personalized text messages that feel human, not spammy. Automated sequences that follow up until they book or opt out.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                  <Phone className="h-6 w-6 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">AI Voice Drops</h3>
                  <p className="text-gray-600">
                    Professional voicemails delivered directly to their inbox. No awkward phone calls, no playing phone tag. Just a friendly reminder you exist.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                  <Bot className="h-6 w-6 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">AI Response Detection</h3>
                  <p className="text-gray-600">
                    Automatically detects positive responses (&ldquo;Yes, I&apos;m interested!&rdquo;) vs. opt-outs. Routes hot leads to you instantly.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-6 w-6 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">Revenue Attribution</h3>
                  <p className="text-gray-600">
                    Track exactly how much revenue each campaign generates. Know your ROI down to the penny.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-brand-gradient rounded-2xl p-8 text-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Reactivation Campaign</p>
                    <p className="text-sm text-white/70">Running • 847 contacts</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-white/70">Messages Sent</span>
                      <span className="font-semibold">2,541</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full">
                      <div className="h-full w-3/4 bg-white rounded-full" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold">127</p>
                      <p className="text-sm text-white/70">Responses</p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold">43</p>
                      <p className="text-sm text-white/70">Bookings</p>
                    </div>
                  </div>

                  <div className="bg-green-500/20 rounded-lg p-4 border border-green-400/30">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-300" />
                      <span className="font-semibold">$12,470 Revenue Generated</span>
                    </div>
                    <p className="text-sm text-white/70 mt-1">From $127 in message costs</p>
                  </div>
                </div>
              </div>

              {/* Floating notification */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-lg shadow-xl p-4 border border-gray-100 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">New Booking!</p>
                    <p className="text-xs text-gray-500">Sarah M. just booked a cleaning</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">How It Works</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              Up and running in 10 minutes. Seriously.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              No complicated setup. No IT department needed. If you can upload a spreadsheet, you can use Vistrial.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <h3 className="font-semibold text-xl text-gray-900">Upload Your Contacts</h3>
              </div>
              <p className="text-gray-600 ml-16">
                Export your customer list from whatever you use now—Jobber, Housecall Pro, ServiceTitan, or just a spreadsheet. Drag, drop, done.
              </p>
              <div className="hidden md:block absolute top-6 left-full w-full h-0.5 bg-gradient-to-r from-brand-600 to-transparent" />
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <h3 className="font-semibold text-xl text-gray-900">Pick a Campaign</h3>
              </div>
              <p className="text-gray-600 ml-16">
                Choose from proven templates: &ldquo;We Miss You&rdquo; reactivation, seasonal promotions, review requests. Or build your own in our drag-and-drop editor.
              </p>
              <div className="hidden md:block absolute top-6 left-full w-full h-0.5 bg-gradient-to-r from-brand-600 to-transparent" />
            </div>

            {/* Step 3 */}
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <h3 className="font-semibold text-xl text-gray-900">Watch Bookings Roll In</h3>
              </div>
              <p className="text-gray-600 ml-16">
                Sit back while Vistrial sends messages on autopilot. Get notified when someone&apos;s interested. Track revenue from your dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SOCIAL PROOF / STATS ==================== */}
      <section className="py-20 bg-brand-gradient text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <StatsCounter />
        </div>
      </section>

      {/* ==================== FEATURES GRID ==================== */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Built by people who understand home service businesses. Every feature exists because it drives revenue.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<MessageSquare className="h-6 w-6" />}
              title="Two-Way SMS Inbox"
              description="Reply to customers directly from Vistrial. Full conversation history, quick templates, team assignment."
            />
            <FeatureCard
              icon={<Phone className="h-6 w-6" />}
              title="AI Voice Drops"
              description="Professional voicemails powered by AI. Natural-sounding, personalized, delivered without ringing."
            />
            <FeatureCard
              icon={<Target className="h-6 w-6" />}
              title="Smart Segmentation"
              description="Target customers by last job date, service type, value, or any custom field. Right message, right person."
            />
            <FeatureCard
              icon={<RefreshCw className="h-6 w-6" />}
              title="Multi-Step Workflows"
              description="Automated sequences: SMS → wait 3 days → voice drop → wait 7 days → final SMS. Set it and forget it."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Revenue Attribution"
              description="Track which campaigns generate the most revenue. Know your ROI for every dollar spent."
            />
            <FeatureCard
              icon={<Calendar className="h-6 w-6" />}
              title="Smart Send Times"
              description="Messages go out during business hours in your customer&apos;s timezone. No 3am texts."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="TCPA Compliant"
              description="Automatic opt-out handling, consent tracking, and compliance built in. Stay legal, worry-free."
            />
            <FeatureCard
              icon={<Star className="h-6 w-6" />}
              title="Review Requests"
              description="Automatically ask happy customers for Google reviews. Build your reputation on autopilot."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Team Access"
              description="Invite your team with role-based permissions. Office staff can reply, owners see revenue."
            />
          </div>
        </div>
      </section>

      {/* ==================== DEMO VIDEO ==================== */}
      <section id="demo" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">See It In Action</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              Watch Vistrial generate $8,000 in 2 minutes.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              See exactly how easy it is to upload contacts, launch a campaign, and track your results.
            </p>
          </div>

          <DemoVideo />
        </div>
      </section>

      {/* ==================== ROI CALCULATOR ==================== */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">Calculate Your ROI</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              See how much revenue you&apos;re leaving on the table.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Plug in your numbers. Most home service businesses see 10-30x ROI.
            </p>
          </div>

          <ROICalculator />
        </div>
      </section>

      {/* ==================== TESTIMONIALS ==================== */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">Success Stories</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              Home service businesses love Vistrial.
            </h2>
          </div>

          <TestimonialCarousel />
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">Pricing</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              Simple pricing. Unlimited campaigns.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Pay for your contact limit, then just pay for messages sent. No hidden fees, no long-term contracts.
            </p>
          </div>

          <PricingCards />
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-brand-200 text-brand-700">FAQ</Badge>
            <h2 className="text-3xl font-bold mb-4 text-gray-900">
              Common questions, straight answers.
            </h2>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-white rounded-lg border border-gray-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                How is this different from Mailchimp or other email tools?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Email open rates for home services are around 15-20%. SMS open rates are 98%. Vistrial focuses on SMS and voice—the channels that actually get responses. Plus, we&apos;re built specifically for reactivation campaigns, not generic marketing.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-white rounded-lg border border-gray-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                Is this legal? What about spam laws?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Yes, 100% legal when used properly. Vistrial is built with TCPA compliance in mind. We automatically handle opt-outs, respect quiet hours, and provide consent tracking. You should have prior business relationships with the contacts you&apos;re messaging (your past customers), which is the safest form of SMS marketing.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-white rounded-lg border border-gray-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                How do voice drops work? Do I record myself?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                No recording needed! You write the script, our AI generates a natural-sounding voice message. It&apos;s delivered as a ringless voicemail—goes directly to their voicemail without their phone ringing. Professional, non-intrusive, highly effective.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-white rounded-lg border border-gray-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                What kind of results can I expect?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Most home service businesses see 5-15% response rates and 2-5% booking rates from dormant customer reactivation campaigns. On a list of 1,000 old customers, that&apos;s 20-50 new bookings. At an average job value of $250, that&apos;s $5,000-$12,500 in revenue from a single campaign.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-white rounded-lg border border-gray-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                Can I integrate with my existing software?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Vistrial works via CSV import, which means it works with any software that can export contacts: Jobber, Housecall Pro, ServiceTitan, ServiceM8, or even just a spreadsheet. We&apos;re also building direct integrations with popular platforms.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="bg-white rounded-lg border border-gray-200 px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900">
                What happens when someone replies?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Replies come into your Vistrial inbox where you can respond directly. Our AI categorizes responses (interested, not interested, question, opt-out) so you can prioritize hot leads. You can also get notifications via email or SMS when someone responds.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="py-20 bg-brand-gradient text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Stop paying for new customers when your old ones are waiting.
          </h2>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Every day you wait is another day your competitors are reaching out to your past customers. Start your free trial in the next 5 minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button
                size="lg"
                variant="secondary"
                className="text-lg px-8 h-12 bg-white text-brand-600 hover:bg-white/90"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <p className="text-white/60 text-sm">
              Free 14-day trial • No credit card required
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

// Feature Card Component
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
    <Card className="hover:shadow-lg transition-shadow border-gray-200 bg-white">
      <CardContent className="pt-6">
        <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center mb-4 text-brand-600">
          {icon}
        </div>
        <h3 className="font-semibold text-lg mb-2 text-gray-900">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </CardContent>
    </Card>
  );
}
