// @ts-nocheck
'use client';

// ============================================
// SUBSCRIPTION CARD
// ============================================

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ExternalLink, Check } from 'lucide-react';
import { PLANS, formatCentsToDollars } from '@/lib/stripe/prices';
import type { Organization } from '@/types/database';

interface SubscriptionCardProps {
  organization: Organization;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  trialing: 'bg-blue-500/20 text-blue-400',
  past_due: 'bg-yellow-500/20 text-yellow-400',
  canceled: 'bg-red-500/20 text-red-400',
  incomplete: 'bg-gray-500/20 text-gray-400',
};

export function SubscriptionCard({ organization }: SubscriptionCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { toast } = useToast();

  const currentPlan = PLANS[organization.plan_tier as keyof typeof PLANS] || PLANS.starter;
  const isSubscribed = organization.subscription_status === 'active' || organization.subscription_status === 'trialing';

  const handleSubscribe = async (planTier: string) => {
    setLoadingPlan(planTier);
    setIsLoading(true);

    try {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_tier: planTier }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout',
        variant: 'destructive',
      });
      setIsLoading(false);
      setLoadingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/billing/create-portal', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open billing portal');
      }

      window.location.href = data.url;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to open billing portal',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-gray-900/80 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Subscription</CardTitle>
            <CardDescription className="text-gray-400">Your current plan and billing</CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={statusColors[organization.subscription_status] || 'bg-gray-500/20 text-gray-400'}
          >
            {organization.subscription_status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSubscribed ? (
          <>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-white/5">
              <div>
                <p className="font-semibold text-lg text-white">{currentPlan.name}</p>
                <p className="text-gray-400">
                  ${currentPlan.priceMonthly}/month
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Contact Limit</p>
                <p className="font-semibold text-white">
                  {currentPlan.contactLimit.toLocaleString()}
                </p>
              </div>
            </div>

            <Button onClick={handleManageBilling} disabled={isLoading} className="w-full bg-violet-600 hover:bg-violet-700">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Manage Subscription
                  <ExternalLink className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Choose a plan to start sending messages
            </p>

            {Object.entries(PLANS).map(([key, plan]) => (
              <div
                key={key}
                className={`p-4 border rounded-lg ${
                  plan.recommended ? 'border-violet-500/50 ring-1 ring-violet-500/30' : 'border-white/10'
                } bg-gray-800/50`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">{plan.name}</p>
                    <p className="text-2xl font-bold text-white">
                      ${plan.priceMonthly}
                      <span className="text-sm font-normal text-gray-400">
                        /month
                      </span>
                    </p>
                  </div>
                  {plan.recommended && (
                    <Badge className="bg-violet-500/20 text-violet-400">Recommended</Badge>
                  )}
                </div>

                <ul className="space-y-2 mb-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center text-sm text-gray-300">
                      <Check className="h-4 w-4 text-green-400 mr-2" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(key)}
                  disabled={isLoading}
                  variant={plan.recommended ? 'default' : 'outline'}
                  className={plan.recommended ? 'w-full bg-violet-600 hover:bg-violet-700' : 'w-full border-white/10 bg-gray-800 hover:bg-gray-700 text-white'}
                >
                  {loadingPlan === key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `Subscribe to ${plan.name}`
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
