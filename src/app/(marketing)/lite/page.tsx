// ============================================
// VISTRIAL LITE LANDING PAGE
// Self-serve tier for smaller businesses
// ============================================

import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  RiCheckLine,
  RiArrowRightLine,
  RiMessage2Line,
  RiGroupLine,
  RiFlashlightLine,
  RiTimeLine,
  RiShieldCheckLine,
  RiSparklingLine,
  RiCloseLine,
} from '@remixicon/react';
import { GrowthPlanCard } from '@/components/marketing/growth-plan-card';

export const metadata: Metadata = {
  title: 'Vistrial Lite - Reactivate Customers for $49/month',
  description:
    'The easiest way to bring back old customers. Pre-built SMS campaigns, 250 contacts, self-serve setup. Perfect for growing home service businesses.',
};

export default function LitePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-green-50/50 to-white pt-20 pb-16">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        
        {/* Gradient orbs */}
        <div className="absolute -right-64 -top-64 h-[500px] w-[500px] rounded-full bg-green-400/20 blur-3xl" />
        <div className="absolute -bottom-64 -left-64 h-[500px] w-[500px] rounded-full bg-green-600/10 blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge
            variant="outline"
            className="mb-6 px-4 py-1.5 text-sm border-green-200 bg-green-50 text-green-700"
          >
            <RiSparklingLine className="h-3.5 w-3.5 mr-2 text-green-600" />
            Perfect for growing businesses
          </Badge>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 mb-6">
            Bring back old customers.
            <span className="text-green-600"> $49/month.</span>
          </h1>

          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            No demo calls. No complex setup. Just upload your customer list, pick a template, and start getting bookings. Perfect for businesses doing under $10K/month.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/signup?plan=lite">
              <Button size="xl" className="text-lg px-8 h-12 bg-green-600 hover:bg-green-700">
                Start Free 7-Day Trial
                <RiArrowRightLine className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <RiCheckLine className="h-4 w-4 text-green-600" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <RiCheckLine className="h-4 w-4 text-green-600" />
              <span>Setup in 5 minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <RiCheckLine className="h-4 w-4 text-green-600" />
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* What You Get */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything you need to reactivate customers
            </h2>
            <p className="text-lg text-gray-600">
              Simple, focused, and built for businesses just like yours.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <RiGroupLine className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">250 Contacts</h3>
                <p className="text-gray-600">
                  Upload up to 250 past customers. Perfect for getting started without overwhelm.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <RiMessage2Line className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">SMS Campaigns</h3>
                <p className="text-gray-600">
                  Send personalized text messages to bring back dormant customers. $0.015 per message.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <RiFlashlightLine className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Pre-Built Templates</h3>
                <p className="text-gray-600">
                  Proven 3-step sequences ready to go. Just customize with your business name and hit send.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <RiTimeLine className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Smart Scheduling</h3>
                <p className="text-gray-600">
                  Messages go out during business hours only. No 3am texts to your customers.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <RiShieldCheckLine className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Auto Opt-Out</h3>
                <p className="text-gray-600">
                  Automatic STOP detection keeps you compliant. We handle the legal stuff.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <RiMessage2Line className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Response Inbox</h3>
                <p className="text-gray-600">
                  See all replies in one place. Know instantly when someone&apos;s interested.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Lite vs Growth Comparison */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Lite vs Growth - Pick Your Path
            </h2>
            <p className="text-lg text-gray-600">
              Start with Lite, upgrade when you&apos;re ready.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Lite Plan */}
            <Card className="border-green-200 border-2 bg-white">
              <CardHeader className="text-center pb-4">
                <Badge className="w-fit mx-auto mb-2 bg-green-100 text-green-700 ring-green-600/20">
                  You Are Here
                </Badge>
                <CardTitle className="text-2xl text-gray-900">Lite</CardTitle>
                <CardDescription>For growing businesses</CardDescription>
                <div className="pt-4">
                  <span className="text-4xl font-bold text-gray-900">$49</span>
                  <span className="text-gray-500">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <FeatureRow included>250 contacts</FeatureRow>
                <FeatureRow included>SMS campaigns</FeatureRow>
                <FeatureRow included>Pre-built templates</FeatureRow>
                <FeatureRow included>Response inbox</FeatureRow>
                <FeatureRow included>Auto opt-out handling</FeatureRow>
                <FeatureRow included>Email support</FeatureRow>
                <FeatureRow>Voice drops</FeatureRow>
                <FeatureRow>Custom workflows</FeatureRow>
                <FeatureRow>Revenue tracking</FeatureRow>
                <FeatureRow>Priority support</FeatureRow>

                <div className="pt-4">
                  <Link href="/signup?plan=lite">
                    <Button className="w-full bg-green-600 hover:bg-green-700">
                      Start Free Trial
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Growth Plan */}
            <GrowthPlanCard />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Up and running in 5 minutes
            </h2>
          </div>

          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 mb-1">Create your account</h3>
                <p className="text-gray-600">
                  Sign up with your email. No credit card needed for the 7-day trial.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 mb-1">Upload your customer list</h3>
                <p className="text-gray-600">
                  Export from Jobber, Housecall Pro, or just a spreadsheet. Drag and drop.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 mb-1">Pick a template</h3>
                <p className="text-gray-600">
                  Choose &ldquo;We Miss You,&rdquo; &ldquo;Seasonal Reminder,&rdquo; or &ldquo;Review Request.&rdquo; Customize the text with your business name.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold shrink-0">
                4
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900 mb-1">Launch and watch the replies come in</h3>
                <p className="text-gray-600">
                  Hit send. Messages go out automatically. You&apos;ll see responses in your inbox within hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Real results from real businesses
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <p className="mb-4 italic text-gray-700">
                  &ldquo;I uploaded 180 old customers and got 12 bookings in the first week. That&apos;s over $2,400 from a $49 tool.&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                    M
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Maria S.</p>
                    <p className="text-sm text-gray-500">Sunshine Cleaning Co.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardContent className="pt-6">
                <p className="mb-4 italic text-gray-700">
                  &ldquo;Way simpler than I expected. I&apos;m not tech-savvy at all and I had my first campaign running in like 10 minutes.&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                    T
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Tom R.</p>
                    <p className="text-sm text-gray-500">Tom&apos;s Lawn Care</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Quick answers
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">What happens after 250 contacts?</h3>
              <p className="text-gray-600">
                You can upgrade to our Starter plan ($99/month for 1,000 contacts) or Growth plan ($199/month for 5,000 contacts) anytime from your dashboard.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">How much do messages cost?</h3>
              <p className="text-gray-600">
                SMS messages are $0.015 each (about 1.5 cents). A typical 3-message campaign to 250 contacts costs around $11.25.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Can I use my own phone number?</h3>
              <p className="text-gray-600">
                We provide you with a dedicated business number. Replies come to your Vistrial inbox so you can respond from one place.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Is this legal?</h3>
              <p className="text-gray-600">
                Yes! You&apos;re contacting your own past customers (existing business relationship). We handle opt-outs automatically to keep you compliant.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">What if I need help?</h3>
              <p className="text-gray-600">
                Email support is included. We typically respond within 24 hours. Our help docs cover most common questions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 bg-green-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Your old customers are waiting.
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Start your free 7-day trial. No credit card required.
          </p>
          <Link href="/signup?plan=lite">
            <Button
              size="xl"
              variant="secondary"
              className="text-lg px-8 h-12 bg-white text-green-600 hover:bg-white/90"
            >
              Start Free Trial
              <RiArrowRightLine className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}

function FeatureRow({
  children,
  included = false,
}: {
  children: React.ReactNode;
  included?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {included ? (
        <RiCheckLine className="h-4 w-4 text-green-600" />
      ) : (
        <RiCloseLine className="h-4 w-4 text-gray-300" />
      )}
      <span className={included ? 'text-gray-900' : 'text-gray-400'}>
        {children}
      </span>
    </div>
  );
}
