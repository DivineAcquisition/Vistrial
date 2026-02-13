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
import { getSignupHref } from '@/lib/constants/domains';
import { DemoButton } from './demo-popup';

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
          className={annual ? 'text-gray-400' : 'font-medium text-gray-900'}
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
          className={annual ? 'font-medium text-gray-900' : 'text-gray-400'}
        >
          Annual
          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700 border-0">
            Save 20%
          </Badge>
        </Label>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`relative bg-white ${
              plan.popular ? 'border-brand-600 border-2 shadow-lg shadow-brand-100' : 'border-gray-200'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-brand-600 text-white border-0">Most Popular</Badge>
              </div>
            )}

            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl text-gray-900">{plan.name}</CardTitle>
              <p className="text-sm text-gray-500">{plan.description}</p>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Price */}
              <div className="text-center">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-gray-900">
                    ${annual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-gray-500">/month</span>
                </div>
                {annual && (
                  <p className="text-sm text-gray-500">
                    Billed annually (${plan.annualPrice * 12}/year)
                  </p>
                )}
                <p className="text-sm font-medium text-brand-600 mt-2">
                  {plan.contactLimit} contacts included
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {plan.cta === 'Contact Sales' ? (
                <DemoButton
                  variant="outline"
                  className="w-full bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
                >
                  Book a Demo
                </DemoButton>
              ) : (
                <a href={getSignupHref()}>
                  <Button
                    className={`w-full ${
                      plan.popular 
                        ? 'bg-brand-600 hover:bg-brand-700 text-white' 
                        : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                    }`}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Pricing */}
      <div className="mt-12 text-center">
        <p className="text-gray-500 mb-4">
          Plus pay-as-you-go messaging:
        </p>
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-gray-300 text-gray-600">SMS</Badge>
            <span className="font-medium text-gray-900">$0.015</span>
            <span className="text-gray-500">per message</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-gray-300 text-gray-600">Voice Drop</Badge>
            <span className="font-medium text-gray-900">$0.05</span>
            <span className="text-gray-500">per drop</span>
          </div>
        </div>
      </div>
    </div>
  );
}
