// @ts-nocheck
// ============================================
// USAGE CARD
// ============================================

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { MessageSquare, Phone, Users } from 'lucide-react';

interface UsageCardProps {
  smsCount: number;
  voiceCount: number;
  contactCount: number;
  contactLimit: number;
}

export function UsageCard({
  smsCount,
  voiceCount,
  contactCount,
  contactLimit,
}: UsageCardProps) {
  const contactPercentage = Math.round((contactCount / contactLimit) * 100);

  return (
    <Card className="bg-white/80 border-gray-200">
      <CardHeader>
        <CardTitle className="text-gray-900">Usage This Month</CardTitle>
        <CardDescription className="text-gray-400">
          Message and contact usage for the current billing period
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-3">
          {/* SMS Usage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <MessageSquare className="h-4 w-4 text-blue-400" />
              </div>
              <span className="font-medium text-gray-900">SMS Sent</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{smsCount.toLocaleString()}</p>
            <p className="text-sm text-gray-400">
              messages this month
            </p>
          </div>

          {/* Voice Usage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Phone className="h-4 w-4 text-purple-400" />
              </div>
              <span className="font-medium text-gray-900">Voice Drops</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{voiceCount.toLocaleString()}</p>
            <p className="text-sm text-gray-400">
              voice drops this month
            </p>
          </div>

          {/* Contact Usage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Users className="h-4 w-4 text-green-400" />
              </div>
              <span className="font-medium text-gray-900">Contacts</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {contactCount.toLocaleString()}
              <span className="text-sm font-normal text-gray-400">
                {' '}/ {contactLimit.toLocaleString()}
              </span>
            </p>
            <Progress value={contactPercentage} className="h-2" />
            <p className="text-sm text-gray-400">
              {contactPercentage}% of limit used
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
