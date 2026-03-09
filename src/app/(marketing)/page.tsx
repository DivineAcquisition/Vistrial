// ============================================
// LANDING PAGE
// All-in-one operations platform for service businesses
// ============================================

import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getSignupHref, getLoginHref } from '@/lib/constants/domains';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiCheckLine,
  RiFlowChart,
  RiInboxLine,
  RiPlayLine,
  RiRobot2Line,
  RiTimeLine,
  RiToolsLine,
  RiUserLine,
} from '@remixicon/react';

export const metadata: Metadata = {
  title: 'Vistrial — Automate Your Service Business',
  description:
    'The all-in-one operations platform for service businesses. Automate follow-ups, manage clients, run SMS workflows, and grow recurring revenue — all from one dashboard.',
  openGraph: {
    title: 'Vistrial — Automate Your Service Business',
    description:
      'The all-in-one operations platform for service businesses. Automate follow-ups, manage clients, run SMS workflows, and grow recurring revenue.',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <>
      {/* ==================== HERO ==================== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/50 to-white pb-24 pt-20">
        <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        <div className="absolute -right-64 -top-64 h-[500px] w-[500px] rounded-full bg-brand-400/20 blur-3xl" />
        <div className="absolute -bottom-64 -left-64 h-[500px] w-[500px] rounded-full bg-brand-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Run Your Service Business on{' '}
              <span className="gradient-text-brand">Autopilot</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
              Automate follow-ups, manage clients, run SMS workflows, and grow recurring revenue — all from one dashboard.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href={getSignupHref()}>
                <Button size="xl" className="text-base">
                  Start Free Trial
                  <RiArrowRightLine className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <Link href="#how-it-works">
                <Button size="xl" variant="outline" className="text-base">
                  <RiPlayLine className="mr-2 h-5 w-5" />
                  See How It Works
                </Button>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <RiCheckLine className="h-4 w-4 text-green-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <RiCheckLine className="h-4 w-4 text-green-600" />
                <span>Setup in under 5 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <RiCheckLine className="h-4 w-4 text-green-600" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PROBLEM ==================== */}
      <section className="border-y border-gray-200 bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-900">
              You&apos;re losing clients because nobody follows up
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Service businesses thrive on repeat customers. Here&apos;s what happens when follow-up falls through the cracks:
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="bg-white ring-1 ring-red-100">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 ring-1 ring-inset ring-red-600/10">
                  <RiTimeLine className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Slow follow-up</h3>
                <p className="text-gray-600">
                  Leads go cold when you wait days to reach out. By the time you follow up, they&apos;ve already booked with someone else.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white ring-1 ring-amber-100">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-600/10">
                  <RiUserLine className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Manual processes</h3>
                <p className="text-gray-600">
                  Sending texts one by one, copying from spreadsheets, chasing down phone numbers. Your team spends hours on work that should be automated.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white ring-1 ring-orange-100">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 ring-1 ring-inset ring-orange-600/10">
                  <RiToolsLine className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Scattered tools</h3>
                <p className="text-gray-600">
                  Contacts in one place, messages in another, analytics somewhere else. Nothing talks to each other, and you lose the full picture.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ==================== SOLUTION ==================== */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <Badge variant="default" className="mb-4">The Solution</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              One platform. Every operation.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Everything you need to run your service business — client management, automation, messaging, and analytics — in a single dashboard.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<RiUserLine className="h-6 w-6" />}
              title="Client CRM"
              description="Manage contacts, import CSV, and track full history. One source of truth for every client."
            />
            <FeatureCard
              icon={<RiFlowChart className="h-6 w-6" />}
              title="Workflow Automation"
              description="Multi-step SMS and email sequences with triggers and scheduling. Set it and forget it."
            />
            <FeatureCard
              icon={<RiInboxLine className="h-6 w-6" />}
              title="Two-Way Inbox"
              description="Conversations with clients in one place. Reply management, templates, and team assignment."
            />
            <FeatureCard
              icon={<RiBarChartBoxLine className="h-6 w-6" />}
              title="Analytics"
              description="Track responses, conversions, and revenue impact. Know exactly what&apos;s working."
            />
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how-it-works" className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <Badge variant="default" className="mb-4">How It Works</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Up and running in minutes
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Three simple steps to put your service business on autopilot.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="relative">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-4 ring-brand-600/20">
                  1
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Set up your workspace</h3>
              </div>
              <p className="ml-16 text-gray-600">
                5-minute onboarding. Add your business details, verify your number, and you&apos;re ready to go.
              </p>
              <div className="absolute right-0 top-6 hidden h-0.5 w-full bg-gradient-to-r from-brand-600 to-transparent md:block" style={{ left: '100%', width: 'calc(100% - 48px)' }} />
            </div>

            <div className="relative">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-4 ring-brand-600/20">
                  2
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Import clients or connect tools</h3>
              </div>
              <p className="ml-16 text-gray-600">
                Upload a CSV or connect via webhooks. Your contacts sync automatically and stay up to date.
              </p>
              <div className="absolute right-0 top-6 hidden h-0.5 w-full bg-gradient-to-r from-brand-600 to-transparent md:block" style={{ left: '100%', width: 'calc(100% - 48px)' }} />
            </div>

            <div>
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-4 ring-brand-600/20">
                  3
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Activate workflows</h3>
              </div>
              <p className="ml-16 text-gray-600">
                Turn on automated follow-ups. Messages go out on schedule, replies land in your inbox, and revenue grows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== AI FEATURE HIGHLIGHT ==================== */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-8 md:p-12 text-white shadow-[0_8px_40px_rgba(83,71,209,0.25)] ring-1 ring-inset ring-white/10">
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <RiRobot2Line className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  AI-Powered Workflow Builder
                </h2>
                <p className="mt-4 text-lg text-white/90 leading-relaxed">
                  Describe what you want to automate and our AI builds the perfect workflow for your business — personalized messages, optimal timing, the right channel.
                </p>
              </div>
              <div className="shrink-0">
                <a href={getSignupHref()}>
                  <Button size="lg" className="bg-white text-brand-600 hover:bg-white/90 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                    Try It Free
                    <RiArrowRightLine className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing" className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <Badge variant="default" className="mb-4">Pricing</Badge>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Simple pricing. No surprises.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Choose the plan that fits your business. All plans include a free trial.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            <Card className="border-2 border-gray-200 bg-white">
              <CardContent className="pt-8">
                <h3 className="text-xl font-bold text-gray-900">Starter</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">$99</span>
                  <span className="text-gray-500">/mo</span>
                </div>
                <ul className="mt-6 space-y-3 text-gray-600">
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    1,000 contacts
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    Unlimited workflows
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    SMS sending
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    2-way inbox
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    Analytics
                  </li>
                </ul>
                <a href={getSignupHref()} className="mt-8 block">
                  <Button variant="outline" size="lg" className="w-full">
                    Start Free Trial
                    <RiArrowRightLine className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border-2 border-brand-500 bg-white shadow-soft-lg ring-2 ring-brand-500/20">
              <CardContent className="pt-8">
                <Badge variant="default" className="mb-4">Most Popular</Badge>
                <h3 className="text-xl font-bold text-gray-900">Growth</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">$199</span>
                  <span className="text-gray-500">/mo</span>
                </div>
                <ul className="mt-6 space-y-3 text-gray-600">
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    5,000 contacts
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    Everything in Starter
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    AI workflow builder
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    Priority support
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckLine className="h-5 w-5 shrink-0 text-green-600" />
                    API access
                  </li>
                </ul>
                <a href={getSignupHref()} className="mt-8 block">
                  <Button size="lg" className="w-full">
                    Start Free Trial
                    <RiArrowRightLine className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section id="faq" className="py-24">
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
                What types of service businesses is Vistrial built for?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Vistrial works for any service business that relies on repeat customers and follow-up: cleaning, HVAC, plumbing, landscaping, home repair, salons, fitness studios, and more. If you have a client list and need to stay in touch, Vistrial helps you automate it.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                How do I import my existing contacts?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Upload a CSV with name, phone, and email. We support common formats from Jobber, Housecall Pro, ServiceTitan, and spreadsheets. You can also connect via webhooks for real-time sync with your existing tools.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                Is Vistrial compliant with SMS and marketing laws?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Yes. Vistrial is built with TCPA compliance in mind. We handle opt-outs automatically, respect quiet hours, and provide consent tracking. You should have prior business relationships with the contacts you message.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                What happens when a client replies to an automated message?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Replies land in your two-way inbox. You can respond directly, use templates, or assign conversations to team members. The workflow pauses for that contact so you can handle the conversation personally.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="overflow-hidden rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
              <AccordionTrigger className="py-4 text-left font-semibold text-gray-900 hover:no-underline">
                Can I try Vistrial before committing?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-gray-600">
                Yes. Start a free trial with no credit card required. You get full access to the platform so you can import contacts, build workflows, and see results before you pay. Cancel anytime.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="relative py-24 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-600 to-brand-700" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.05%22%20stroke-width%3D%221%22%3E%3Cpath%20d%3D%22M0%2020h40M20%200v40%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E')]" />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-brand-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-brand-300/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold sm:text-4xl tracking-tight">
            Ready to automate?
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-white/70 leading-relaxed">
            Join service businesses that run on autopilot. Start your free trial and see the difference in days.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href={getSignupHref()}>
              <Button size="xl" className="bg-white text-brand-600 hover:bg-white/90 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 transition-all duration-200 rounded-xl">
                Start Free Trial
                <RiArrowRightLine className="ml-2 h-5 w-5" />
              </Button>
            </a>
            <a
              href={getLoginHref()}
              className="text-sm font-medium text-white/80 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              Already have an account? Sign in
            </a>
          </div>
          <p className="mt-6 text-sm text-white/50">
            Free trial. No credit card required.
          </p>
        </div>
      </section>
    </>
  );
}

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
