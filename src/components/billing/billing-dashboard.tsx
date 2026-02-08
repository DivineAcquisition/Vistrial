'use client';

// ============================================
// BILLING DASHBOARD COMPONENT
// Full billing management with plan comparison,
// usage meters, subscription actions
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard,
  Check,
  Zap,
  MessageSquare,
  Mail,
  Phone,
  Users,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Receipt,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import type { Plan } from '@/lib/stripe/plans';
import type { UsageData } from '@/lib/stripe/usage';

interface BillingDashboardProps {
  organization: any;
  subscription: any;
  usage: UsageData;
  overageCharges: number;
  currentPlan: Plan;
  plans: Plan[];
  showSuccessMessage?: boolean;
  showCanceledMessage?: boolean;
}

export function BillingDashboard({
  organization,
  subscription,
  usage,
  overageCharges,
  currentPlan,
  plans,
  showSuccessMessage,
  showCanceledMessage,
}: BillingDashboardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(
    'monthly'
  );
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    setIsLoading(planId);

    try {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_tier: planId, interval: billingInterval }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setIsLoading('portal');

    try {
      const response = await fetch('/api/billing/create-portal', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to open portal');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to open billing portal.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription?')) return;

    setIsLoading('cancel');

    try {
      const response = await fetch('/api/billing/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });

      if (response.ok) {
        toast({ title: 'Subscription will cancel at end of billing period' });
        router.refresh();
      } else {
        throw new Error('Failed to cancel');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel subscription',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleResumeSubscription = async () => {
    setIsLoading('resume');

    try {
      const response = await fetch('/api/billing/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });

      if (response.ok) {
        toast({ title: 'Subscription resumed!' });
        router.refresh();
      } else {
        throw new Error('Failed to resume');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to resume subscription',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0;
    return Math.min(100, (used / limit) * 100);
  };

  const formatLimit = (limit: number) => {
    return limit === -1 ? 'Unlimited' : limit.toLocaleString();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
            <p className="text-gray-500 mt-1">
              Manage your subscription and view usage
            </p>
          </div>
          {subscription && (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={isLoading === 'portal'}
              className="rounded-xl"
            >
              {isLoading === 'portal' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Manage Billing
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {showSuccessMessage && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="font-medium text-green-800">Payment successful!</p>
            <p className="text-sm text-green-700">
              Your subscription has been activated.
            </p>
          </div>
        </div>
      )}

      {showCanceledMessage && (
        <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-2xl">
          <AlertCircle className="h-5 w-5 text-gray-500 shrink-0" />
          <div>
            <p className="font-medium text-gray-800">Checkout canceled</p>
            <p className="text-sm text-gray-600">
              No charges were made.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              Current Plan
              {subscription?.cancelAtPeriodEnd && (
                <Badge variant="destructive" className="text-[10px]">
                  Canceling
                </Badge>
              )}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {subscription?.currentPeriodEnd
                ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : 'No active subscription'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-gray-900">
              $
              {billingInterval === 'yearly'
                ? currentPlan.yearlyPrice
                : currentPlan.monthlyPrice}
              <span className="text-sm font-normal text-gray-400">
                /{billingInterval === 'yearly' ? 'year' : 'mo'}
              </span>
            </p>
            <p className="text-sm text-gray-500">{currentPlan.name}</p>
          </div>
        </div>

        {subscription?.cancelAtPeriodEnd ? (
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div>
              <p className="font-medium text-amber-800 text-sm">
                Your subscription will end on{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                You&apos;ll lose access to premium features after this date
              </p>
            </div>
            <Button
              onClick={handleResumeSubscription}
              disabled={isLoading === 'resume'}
              size="sm"
              className="rounded-xl"
            >
              {isLoading === 'resume' && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              Resume
            </Button>
          </div>
        ) : subscription ? (
          <div className="flex justify-end">
            <button
              className="text-xs text-red-500 hover:text-red-600 transition-colors"
              onClick={handleCancelSubscription}
              disabled={isLoading === 'cancel'}
            >
              {isLoading === 'cancel' ? 'Canceling...' : 'Cancel Subscription'}
            </button>
          </div>
        ) : null}
      </div>

      {/* Usage This Period */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Usage This Period
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Track your usage against plan limits
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* SMS */}
          <UsageMeterItem
            icon={<MessageSquare className="h-4 w-4 text-blue-600" />}
            label="SMS Messages"
            used={usage.sms.used}
            limit={usage.sms.limit}
            overage={usage.sms.overage}
            overagePrice={0.02}
          />

          {/* Emails */}
          <UsageMeterItem
            icon={<Mail className="h-4 w-4 text-green-600" />}
            label="Emails"
            used={usage.emails.used}
            limit={usage.emails.limit}
            overage={usage.emails.overage}
            overagePrice={0.001}
          />

          {/* Voice */}
          <UsageMeterItem
            icon={<Phone className="h-4 w-4 text-purple-600" />}
            label="Voice Drops"
            used={usage.voiceDrops.used}
            limit={usage.voiceDrops.limit}
            overage={usage.voiceDrops.overage}
            overagePrice={0.05}
          />

          {/* Contacts */}
          <UsageMeterItem
            icon={<Users className="h-4 w-4 text-amber-600" />}
            label="Contacts"
            used={usage.contacts.used}
            limit={usage.contacts.limit}
          />

          {/* Workflows */}
          <UsageMeterItem
            icon={<Zap className="h-4 w-4 text-orange-600" />}
            label="Workflows"
            used={usage.workflows.used}
            limit={usage.workflows.limit}
          />

          {/* Booking Pages */}
          <UsageMeterItem
            icon={<Calendar className="h-4 w-4 text-teal-600" />}
            label="Booking Pages"
            used={usage.bookingPages.used}
            limit={usage.bookingPages.limit}
          />
        </div>

        {overageCharges > 0 && (
          <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="font-medium text-amber-800 text-sm">
              Estimated overage charges this period: ${overageCharges.toFixed(2)}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Overage charges are billed at the end of your billing period
            </p>
          </div>
        )}
      </div>

      {/* Plans */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Available Plans
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Choose the plan that fits your business
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                billingInterval === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
              onClick={() => setBillingInterval('monthly')}
            >
              Monthly
            </button>
            <button
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                billingInterval === 'yearly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
              onClick={() => setBillingInterval('yearly')}
            >
              Yearly
              <span className="text-[10px] text-green-600 font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isCurrentPlan = subscription?.planId === plan.id ||
              (!subscription && plan.id === 'lite');
            const price =
              billingInterval === 'yearly'
                ? plan.yearlyPrice
                : plan.monthlyPrice;

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative rounded-2xl border-2 p-6 transition-all',
                  plan.popular
                    ? 'border-brand-500/50 shadow-lg shadow-brand-500/10'
                    : 'border-gray-200',
                  isCurrentPlan && 'bg-brand-50/30'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[10px] font-semibold rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Most Popular
                  </div>
                )}

                <div className="text-center mb-5">
                  <h3 className="text-base font-semibold text-gray-900">
                    {plan.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {plan.description}
                  </p>
                  <div className="mt-3">
                    <span className="text-3xl font-bold text-gray-900">
                      ${price}
                    </span>
                    <span className="text-gray-400 text-sm">
                      /{billingInterval === 'yearly' ? 'yr' : 'mo'}
                    </span>
                  </div>
                  {billingInterval === 'yearly' && (
                    <p className="text-[11px] text-green-600 mt-0.5 font-medium">
                      $
                      {Math.round(
                        plan.monthlyPrice * 12 - plan.yearlyPrice
                      )}{' '}
                      savings
                    </p>
                  )}
                </div>

                <ul className="space-y-2.5 mb-5 text-xs">
                  <PlanFeatureItem
                    icon={<Users className="h-3.5 w-3.5" />}
                    text={`${plan.features.contacts.toLocaleString()} contacts`}
                  />
                  <PlanFeatureItem
                    icon={<MessageSquare className="h-3.5 w-3.5" />}
                    text={`${plan.features.smsPerMonth.toLocaleString()} SMS/month`}
                  />
                  <PlanFeatureItem
                    icon={<Mail className="h-3.5 w-3.5" />}
                    text={`${plan.features.emailsPerMonth.toLocaleString()} emails/month`}
                  />
                  <PlanFeatureItem
                    icon={<Phone className="h-3.5 w-3.5" />}
                    text={
                      plan.features.voiceDropsPerMonth === 0
                        ? 'No voice drops'
                        : `${plan.features.voiceDropsPerMonth.toLocaleString()} voice drops`
                    }
                    disabled={plan.features.voiceDropsPerMonth === 0}
                  />
                  <PlanFeatureItem
                    icon={<Zap className="h-3.5 w-3.5" />}
                    text={
                      plan.features.workflows === -1
                        ? 'Unlimited workflows'
                        : `${plan.features.workflows} workflows`
                    }
                  />
                  <PlanFeatureItem
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    text={
                      plan.features.bookingPages === -1
                        ? 'Unlimited booking pages'
                        : `${plan.features.bookingPages} booking page${
                            plan.features.bookingPages > 1 ? 's' : ''
                          }`
                    }
                  />
                  <PlanFeatureItem
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    text={
                      plan.features.customBranding
                        ? 'Custom branding'
                        : 'Vistrial branding'
                    }
                    disabled={!plan.features.customBranding}
                  />
                </ul>

                {isCurrentPlan ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl font-medium text-sm bg-gray-100 text-gray-400 cursor-default flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Current Plan
                  </button>
                ) : (
                  <Button
                    className="w-full rounded-xl"
                    variant={plan.popular ? 'gradient' : 'outline'}
                    size="sm"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isLoading === plan.id}
                  >
                    {isLoading === plan.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : null}
                    {subscription ? 'Switch Plan' : 'Get Started'}
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice History Placeholder */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Invoice History
          </h2>
          {subscription && (
            <button
              onClick={handleManageBilling}
              className="text-brand-600 hover:text-brand-700 font-medium text-sm transition-colors"
            >
              View all
            </button>
          )}
        </div>

        <div className="p-12 text-center">
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-200">
            <Receipt className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-sm mb-1">
            No invoices yet
          </p>
          <p className="text-gray-400 text-xs">
            Invoices appear here after your first billing cycle
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function UsageMeterItem({
  icon,
  label,
  used,
  limit,
  overage,
  overagePrice,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
  overage?: number;
  overagePrice?: number;
}) {
  const percentage =
    limit === -1 ? 0 : Math.min(100, (used / limit) * 100);
  const isOver = overage && overage > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-gray-700">{label}</span>
        </span>
        <span className="font-medium text-xs text-gray-900">
          {used.toLocaleString()} /{' '}
          {limit === -1 ? '\u221e' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isOver
              ? 'bg-amber-500'
              : percentage > 80
              ? 'bg-orange-400'
              : 'bg-gradient-to-r from-brand-500 to-brand-400'
          )}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      {isOver && overagePrice && (
        <p className="text-[10px] text-amber-600">
          +{overage} overage ($
          {(overage * overagePrice).toFixed(2)})
        </p>
      )}
    </div>
  );
}

function PlanFeatureItem({
  icon,
  text,
  disabled = false,
}: {
  icon: React.ReactNode;
  text: string;
  disabled?: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2',
        disabled ? 'text-gray-400' : 'text-gray-600'
      )}
    >
      <span className={disabled ? 'opacity-30' : 'text-brand-600'}>
        {icon}
      </span>
      {text}
    </li>
  );
}
