// @ts-nocheck
'use client';

// ============================================
// CREDITS CARD
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Coins, AlertTriangle } from 'lucide-react';
import { REFILL_OPTIONS, formatCentsToDollars } from '@/lib/stripe/prices';
import type { CreditBalance } from '@/types/database';

interface CreditsCardProps {
  organizationId: string;
  credits: CreditBalance | null;
}

export function CreditsCard({ organizationId, credits }: CreditsCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(2500); // $25 default
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(
    credits?.auto_refill_enabled || false
  );
  const [autoRefillAmount, setAutoRefillAmount] = useState(
    credits?.auto_refill_amount_cents || 2500
  );
  const { toast } = useToast();

  const balance = credits?.balance_cents || 0;
  const isLow = balance < 1500; // Less than $15

  const handleRefill = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/billing/refill-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: selectedAmount }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add credits');
      }

      toast({
        title: 'Credits added',
        description: `${formatCentsToDollars(selectedAmount)} has been added to your balance.`,
      });

      // Refresh page to show new balance
      window.location.reload();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add credits',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAutoRefill = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/billing/auto-refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: autoRefillEnabled,
          amount_cents: autoRefillAmount,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update auto-refill settings');
      }

      toast({
        title: 'Settings saved',
        description: autoRefillEnabled
          ? `Auto-refill enabled at ${formatCentsToDollars(autoRefillAmount)}`
          : 'Auto-refill disabled',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-white/80 border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Coins className="h-5 w-5 text-brand-400" />
              Message Credits
            </CardTitle>
            <CardDescription className="text-gray-400">Credits for SMS and voice drops</CardDescription>
          </div>
          {isLow && (
            <div className="flex items-center text-yellow-400">
              <AlertTriangle className="h-4 w-4 mr-1" />
              <span className="text-sm">Low balance</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Balance */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-sm text-gray-400 mb-1">Current Balance</p>
          <p className="text-3xl font-bold text-gray-900">{formatCentsToDollars(balance)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div>≈ {Math.floor(balance / 1.5)} SMS messages</div>
            <div>≈ {Math.floor(balance / 5)} voice drops</div>
          </div>
        </div>

        {/* Quick Refill */}
        <div className="space-y-3">
          <Label className="text-gray-300">Add Credits</Label>
          <div className="flex gap-2">
            <Select
              value={selectedAmount.toString()}
              onValueChange={(v) => setSelectedAmount(parseInt(v))}
            >
              <SelectTrigger className="flex-1 bg-white border-gray-200 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {REFILL_OPTIONS.map((amount) => (
                  <SelectItem key={amount} value={amount.toString()} className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">
                    {formatCentsToDollars(amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRefill} disabled={isLoading} className="bg-brand-600 hover:bg-brand-700">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Add'
              )}
            </Button>
          </div>
        </div>

        {/* Auto-Refill Settings */}
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-refill" className="text-gray-300">Auto-Refill</Label>
              <p className="text-xs text-gray-500">
                Automatically add credits when balance is low
              </p>
            </div>
            <Switch
              id="auto-refill"
              checked={autoRefillEnabled}
              onCheckedChange={setAutoRefillEnabled}
            />
          </div>

          {autoRefillEnabled && (
            <div className="space-y-2">
              <Label className="text-gray-300">Refill Amount</Label>
              <Select
                value={autoRefillAmount.toString()}
                onValueChange={(v) => setAutoRefillAmount(parseInt(v))}
              >
                <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {REFILL_OPTIONS.map((amount) => (
                    <SelectItem key={amount} value={amount.toString()} className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">
                      {formatCentsToDollars(amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                When balance drops below $15, we&apos;ll automatically charge your card
              </p>
            </div>
          )}

          <Button
            variant="outline"
            onClick={handleSaveAutoRefill}
            disabled={isLoading}
            className="w-full border-gray-200 bg-white hover:bg-gray-100 text-gray-900"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Save Auto-Refill Settings'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
