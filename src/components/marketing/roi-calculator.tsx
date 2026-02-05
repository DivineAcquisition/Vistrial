'use client';

// ============================================
// ROI CALCULATOR
// Interactive ROI calculator
// ============================================

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export function ROICalculator() {
  const [contacts, setContacts] = useState(1000);
  const [avgJobValue, setAvgJobValue] = useState(250);
  const [reactivationRate, setReactivationRate] = useState(5);

  const results = useMemo(() => {
    const messagesPerContact = 3; // Average multi-step campaign
    const smsPercentage = 0.7;
    const voicePercentage = 0.3;

    const totalMessages = contacts * messagesPerContact;
    const smsCost = totalMessages * smsPercentage * 0.015;
    const voiceCost = totalMessages * voicePercentage * 0.05;
    const messagingCost = smsCost + voiceCost;

    const planCost = contacts <= 1000 ? 99 : contacts <= 5000 ? 199 : 399;
    const totalCost = messagingCost + planCost;

    const reactivatedCustomers = Math.round(contacts * (reactivationRate / 100));
    const revenue = reactivatedCustomers * avgJobValue;
    const profit = revenue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    return {
      totalCost: totalCost.toFixed(2),
      messagingCost: messagingCost.toFixed(2),
      planCost,
      reactivatedCustomers,
      revenue: revenue.toLocaleString(),
      profit: profit.toLocaleString(),
      roi: roi.toFixed(0),
    };
  }, [contacts, avgJobValue, reactivationRate]);

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="bg-white border-gray-200">
        <CardContent className="p-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Inputs */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label className="text-gray-700">Dormant Customers</Label>
                  <span className="font-semibold text-gray-900">{contacts.toLocaleString()}</span>
                </div>
                <Slider
                  value={[contacts]}
                  onValueChange={([value]) => setContacts(value)}
                  min={100}
                  max={10000}
                  step={100}
                  className="[&_[role=slider]]:bg-brand-600"
                />
                <p className="text-xs text-gray-500">
                  Customers who haven&apos;t booked in 90+ days
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label className="text-gray-700">Average Job Value</Label>
                  <span className="font-semibold text-gray-900">${avgJobValue}</span>
                </div>
                <Slider
                  value={[avgJobValue]}
                  onValueChange={([value]) => setAvgJobValue(value)}
                  min={50}
                  max={1000}
                  step={25}
                  className="[&_[role=slider]]:bg-brand-600"
                />
                <p className="text-xs text-gray-500">
                  Your typical service ticket
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label className="text-gray-700">Expected Reactivation Rate</Label>
                  <span className="font-semibold text-gray-900">{reactivationRate}%</span>
                </div>
                <Slider
                  value={[reactivationRate]}
                  onValueChange={([value]) => setReactivationRate(value)}
                  min={1}
                  max={15}
                  step={1}
                  className="[&_[role=slider]]:bg-brand-600"
                />
                <p className="text-xs text-gray-500">
                  Industry average is 3-8% for dormant reactivation
                </p>
              </div>
            </div>

            {/* Results */}
            <div className="bg-brand-gradient rounded-xl p-6 text-white">
              <h3 className="text-lg font-semibold mb-6">Your Potential Results</h3>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Your Investment</span>
                  <span className="font-semibold">${results.totalCost}</span>
                </div>
                <div className="text-xs text-white/50 ml-4">
                  ${results.planCost}/mo plan + ${results.messagingCost} messaging
                </div>

                <div className="border-t border-white/20 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white/70">Customers Reactivated</span>
                    <span className="font-semibold">{results.reactivatedCustomers}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/70">Revenue Generated</span>
                  <span className="font-semibold text-xl">${results.revenue}</span>
                </div>

                <div className="bg-white/20 rounded-lg p-4 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Net Profit</span>
                    <span className="text-2xl font-bold">${results.profit}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm">{results.roi}x ROI</span>
                  </div>
                </div>
              </div>

              <Link href="/signup" className="block mt-6">
                <Button
                  variant="secondary"
                  className="w-full bg-white text-brand-600 hover:bg-white/90"
                >
                  Start Generating Revenue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
