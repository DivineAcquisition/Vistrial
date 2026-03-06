'use client';

// ============================================
// GROWTH PLAN CARD
// Card with demo booking popup for Growth plan
// ============================================

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RiCheckLine, RiCloseLine } from '@remixicon/react';
import { DemoButton } from './demo-popup';

interface FeatureRowProps {
  children: React.ReactNode;
  included?: boolean;
}

function FeatureRow({ children, included = false }: FeatureRowProps) {
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

export function GrowthPlanCard() {
  return (
    <Card className="bg-white border-gray-200">
      <CardHeader className="text-center pb-4">
        <Badge variant="outline" className="w-fit mx-auto mb-2 border-gray-300 text-gray-600">
          When You&apos;re Ready
        </Badge>
        <CardTitle className="text-2xl text-gray-900">Growth</CardTitle>
        <CardDescription>For scaling businesses</CardDescription>
        <div className="pt-4">
          <span className="text-4xl font-bold text-gray-900">$199</span>
          <span className="text-gray-500">/month</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <FeatureRow included>5,000 contacts</FeatureRow>
        <FeatureRow included>SMS campaigns</FeatureRow>
        <FeatureRow included>Pre-built templates</FeatureRow>
        <FeatureRow included>Response inbox</FeatureRow>
        <FeatureRow included>Auto opt-out handling</FeatureRow>
        <FeatureRow included>Email support</FeatureRow>
        <FeatureRow included>Voice drops</FeatureRow>
        <FeatureRow included>Custom workflows</FeatureRow>
        <FeatureRow included>Revenue tracking</FeatureRow>
        <FeatureRow included>Priority support</FeatureRow>

        <div className="pt-4">
          <DemoButton variant="outline" className="w-full">
            Book a Demo
          </DemoButton>
        </div>
      </CardContent>
    </Card>
  );
}
