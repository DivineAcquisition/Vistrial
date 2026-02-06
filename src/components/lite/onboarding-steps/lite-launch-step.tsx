'use client';

// ============================================
// LITE LAUNCH STEP
// Review and launch campaign
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  RiArrowLeftLine,
  RiRocketLine,
  RiGroupLine,
  RiMessage2Line,
  RiMoneyDollarCircleLine,
  RiLoader4Line,
  RiCheckLine,
} from '@remixicon/react';
import { useToast } from '@/hooks/use-toast';
import type { OnboardingData } from '../lite-onboarding-wizard';

interface LiteLaunchStepProps {
  data: OnboardingData;
  organizationId: string;
  onLaunch: () => void;
  onBack: () => void;
}

const TEMPLATE_NAMES: Record<string, string> = {
  'we-miss-you': 'We Miss You',
  'seasonal-reminder': 'Seasonal Reminder',
  'review-request': 'Review Request',
};

export function LiteLaunchStep({
  data,
  organizationId,
  onLaunch,
  onBack,
}: LiteLaunchStepProps) {
  const { toast } = useToast();
  const [isLaunching, setIsLaunching] = useState(false);

  const messagesPerContact = data.selectedTemplate === 'review-request' ? 2 : 3;
  const totalMessages = data.contactsUploaded * messagesPerContact;
  const estimatedCost = (totalMessages * 0.015).toFixed(2);

  const handleLaunch = async () => {
    setIsLaunching(true);

    try {
      // Create workflow from template
      const response = await fetch('/api/workflows/create-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: data.selectedTemplate,
          customizations: data.customizations,
          enrollAll: true, // Auto-enroll all contacts
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create campaign');
      }

      onLaunch();
    } catch (error) {
      toast({
        title: 'Launch failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Ready to launch!</h2>
        <p className="text-gray-600">
          Review your campaign settings before we start sending messages.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-white border-gray-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <RiGroupLine className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.contactsUploaded}</p>
                <p className="text-sm text-gray-500">Contacts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <RiMessage2Line className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalMessages}</p>
                <p className="text-sm text-gray-500">Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Details */}
      <Card className="bg-white border-gray-200">
        <CardContent className="pt-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Campaign</span>
            <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{TEMPLATE_NAMES[data.selectedTemplate!]}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Business Name</span>
            <span className="font-medium text-gray-900">{data.customizations.businessName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Estimated Cost</span>
            <span className="font-medium text-gray-900">${estimatedCost}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Send Window</span>
            <span className="font-medium text-gray-900">9am - 8pm (customer timezone)</span>
          </div>
        </CardContent>
      </Card>

      {/* Cost Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <RiMoneyDollarCircleLine className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-800">Messaging costs</p>
          <p className="text-amber-700">
            You&apos;ll need message credits to send. Add credits after launching to start your campaign.
            Each SMS costs $0.015.
          </p>
        </div>
      </div>

      {/* What Happens Next */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-4">
          <p className="font-medium mb-3 text-green-800">What happens when you launch:</p>
          <ul className="space-y-2 text-sm text-green-700">
            <li className="flex items-start gap-2">
              <RiCheckLine className="h-4 w-4 mt-0.5 shrink-0" />
              <span>All {data.contactsUploaded} contacts are enrolled in the campaign</span>
            </li>
            <li className="flex items-start gap-2">
              <RiCheckLine className="h-4 w-4 mt-0.5 shrink-0" />
              <span>First message sends within 24 hours (during business hours)</span>
            </li>
            <li className="flex items-start gap-2">
              <RiCheckLine className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Replies appear in your inbox - we&apos;ll notify you</span>
            </li>
            <li className="flex items-start gap-2">
              <RiCheckLine className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Campaign auto-stops when someone replies or opts out</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isLaunching}>
          <RiArrowLeftLine className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={isLaunching}
          className="bg-green-600 hover:bg-green-700"
        >
          {isLaunching ? (
            <>
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <RiRocketLine className="mr-2 h-4 w-4" />
              Launch Campaign
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
