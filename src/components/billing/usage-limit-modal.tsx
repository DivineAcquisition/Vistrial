'use client';

// ============================================
// USAGE LIMIT MODAL
// Shown when user hits a plan limit
// ============================================

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  ArrowRight,
  Zap,
  MessageSquare,
  Mail,
  Phone,
  Users,
  Calendar,
  UserPlus,
} from 'lucide-react';
import { PLANS } from '@/lib/stripe/plans';
import type { UsageCheckResult, ResourceType } from '@/lib/middleware/usage-enforcement';

interface UsageLimitModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  usageCheck: UsageCheckResult;
}

const RESOURCE_ICONS: Record<ResourceType, React.ReactNode> = {
  sms: <MessageSquare className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  voice_drop: <Phone className="h-5 w-5" />,
  contact: <Users className="h-5 w-5" />,
  workflow: <Zap className="h-5 w-5" />,
  booking_page: <Calendar className="h-5 w-5" />,
  team_member: <UserPlus className="h-5 w-5" />,
};

const RESOURCE_NAMES: Record<ResourceType, string> = {
  sms: 'SMS Messages', email: 'Emails', voice_drop: 'Voice Drops',
  contact: 'Contacts', workflow: 'Workflows', booking_page: 'Booking Pages',
  team_member: 'Team Members',
};

export function UsageLimitModal({ open, onClose, resourceType, usageCheck }: UsageLimitModalProps) {
  const router = useRouter();

  const handleUpgrade = () => {
    onClose();
    router.push('/settings/billing');
  };

  const upgradePlans = usageCheck.upgradeToPlans || [];
  const suggestedPlan = upgradePlans.length > 0 ? PLANS[upgradePlans[0]] : null;
  const usagePercent = usageCheck.limit > 0
    ? Math.min(100, (usageCheck.currentUsage / usageCheck.limit) * 100)
    : 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Limit Reached</DialogTitle>
              <DialogDescription>{RESOURCE_NAMES[resourceType]}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {RESOURCE_ICONS[resourceType]}
                Current Usage
              </span>
              <span className="font-medium">
                {usageCheck.currentUsage.toLocaleString()} / {usageCheck.limit.toLocaleString()}
              </span>
            </div>
            <Progress value={usagePercent} />
          </div>

          <p className="text-sm text-gray-500">{usageCheck.reason}</p>

          {suggestedPlan && (
            <div className="p-4 bg-brand-50 rounded-xl border border-brand-100">
              <p className="text-sm font-medium mb-1">Upgrade to {suggestedPlan.name}</p>
              <p className="text-2xl font-bold">
                ${suggestedPlan.monthlyPrice}
                <span className="text-sm font-normal text-gray-500">/month</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto rounded-xl">
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} className="w-full sm:w-auto rounded-xl" variant="gradient">
            Upgrade Now
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
