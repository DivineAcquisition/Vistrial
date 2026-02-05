'use client';

// ============================================
// PRICING CARDS
// Pricing section with plans
// ============================================

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle } from 'lucide-react';

export function PricingCards() {
  const [annual, setAnnual] = useState(false);

  const plans = [
    {
      name: 'Starter',
      description: 'For small businesses just getting started',
      monthlyPrice: 99,
      annualPrice: 79,
      contactLimit: '1,000',
      features: [
        'Up to 1,000 contacts',
        'Unlimited campaigns',
        'SMS messaging ($0.015/msg)',
        'AI voice drops ($0.05/drop)',
        'Two-way inbox',
        'Email support',
      ],
      cta: 'Start Free Trial',
      popular: false,
    },
    {
      name: 'Growth',
      description: 'For growing businesses with larger databases',
      monthlyPrice: 199,
      annualPrice: 159,
      contactLimit: '5,000',
      features: [
        'Up to 5,000 contacts',
        'Everything in Starter',
        'Revenue tracking',
        'Advanced segmentation',
        'Priority support',
        'Custom workflows',
        'Team access (up to 3)',
      ],
      cta: 'Start Free Trial',
      popular: true,
    },
    {
      name: 'Scale',
      description: 'For established businesses with large customer bases',
      monthlyPrice: 399,
      annualPrice: 319,
      contactLimit: '15,000',
      features: [
        'Up to 15,000 contacts',
        'Everything in Growth',
        'Dedicated account manager',
        'API access',
        'Custom integrations',
        'Unlimited team access',
        'Phone support',
      ],
      cta: 'Contact Sales',
      popular: false,
    },
  ];

  return (
    <div>
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <Label
          htmlFor="billing"
          className={annual ? 'text-muted-foreground' : 'font-medium'}
        >
          Monthly
        </Label>
        <Switch
          id="billing"
          checked={annual}
          onCheckedChange={setAnnual}
        />
        <Label
          htmlFor="billing"
          className={annual ? 'font-medium' : 'text-muted-foreground'}
        >
          Annual
          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
            Save 20%
          </Badge>
        </Label>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`relative ${
              plan.popular ? 'border-blue-600 border-2 shadow-lg' : ''
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-blue-600">Most Popular</Badge>
              </div>
            )}

            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Price */}
              <div className="text-center">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">
                    ${annual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {annual && (
                  <p className="text-sm text-muted-foreground">
                    Billed annually (${plan.annualPrice * 12}/year)
                  </p>
                )}
                <p className="text-sm font-medium text-blue-600 mt-2">
                  {plan.contactLimit} contacts included
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link href={plan.cta === 'Contact Sales' ? '/contact' : '/signup'}>
                <Button
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                >
                  {plan.cta}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Pricing */}
      <div className="mt-12 text-center">
        <p className="text-muted-foreground mb-4">
          Plus pay-as-you-go messaging:
        </p>
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline">SMS</Badge>
            <span className="font-medium">$0.015</span>
            <span className="text-muted-foreground">per message</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Voice Drop</Badge>
            <span className="font-medium">$0.05</span>
            <span className="text-muted-foreground">per drop</span>
          </div>
        </div>
      </div>
    </div>
  );
}
