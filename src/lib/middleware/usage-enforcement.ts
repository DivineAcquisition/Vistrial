// ============================================
// USAGE ENFORCEMENT MIDDLEWARE
// Check and enforce plan limits before actions
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PLANS, OVERAGE_PRICES, getPlanById } from '@/lib/stripe/plans';

export type ResourceType =
  | 'sms'
  | 'email'
  | 'voice_drop'
  | 'contact'
  | 'workflow'
  | 'booking_page'
  | 'team_member';

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  remaining: number;
  isOverage: boolean;
  overageRate?: number;
  suggestedAction?: 'upgrade' | 'wait' | 'delete';
  upgradeToPlans?: string[];
}

export interface EnforcementConfig {
  hardLimit: boolean;
  warnAtPercent: number;
  blockAtPercent: number;
}

const ENFORCEMENT_CONFIG: Record<ResourceType, EnforcementConfig> = {
  sms: { hardLimit: false, warnAtPercent: 80, blockAtPercent: 100 },
  email: { hardLimit: false, warnAtPercent: 80, blockAtPercent: 100 },
  voice_drop: { hardLimit: false, warnAtPercent: 80, blockAtPercent: 100 },
  contact: { hardLimit: true, warnAtPercent: 80, blockAtPercent: 100 },
  workflow: { hardLimit: true, warnAtPercent: 80, blockAtPercent: 100 },
  booking_page: { hardLimit: true, warnAtPercent: 80, blockAtPercent: 100 },
  team_member: { hardLimit: true, warnAtPercent: 80, blockAtPercent: 100 },
};

export async function checkUsageLimit(
  organizationId: string,
  resourceType: ResourceType,
  quantity: number = 1
): Promise<UsageCheckResult> {
  const admin = getSupabaseAdminClient();

  const { data: org } = await admin
    .from('organizations')
    .select('subscription_plan, plan_tier, subscription_status, subscription_current_period_start')
    .eq('id', organizationId)
    .single();

  const planId = org?.subscription_plan || org?.plan_tier || 'lite';
  const plan = getPlanById(planId);
  const config = ENFORCEMENT_CONFIG[resourceType];

  if (!plan) {
    return {
      allowed: false,
      reason: 'No valid subscription plan found',
      currentUsage: 0, limit: 0, remaining: 0, isOverage: false,
      suggestedAction: 'upgrade',
    };
  }

  if (org?.subscription_status === 'past_due') {
    return {
      allowed: false,
      reason: 'Your subscription payment is past due. Please update your payment method.',
      currentUsage: 0, limit: 0, remaining: 0, isOverage: false,
      suggestedAction: 'upgrade',
    };
  }

  if (org?.subscription_status === 'canceled') {
    return {
      allowed: false,
      reason: 'Your subscription has been canceled. Please resubscribe.',
      currentUsage: 0, limit: 0, remaining: 0, isOverage: false,
      suggestedAction: 'upgrade',
    };
  }

  const { currentUsage, limit } = await getCurrentUsage(
    admin, organizationId, resourceType, plan, org?.subscription_current_period_start
  );

  const remaining = Math.max(0, limit - currentUsage);
  const wouldExceed = limit !== -1 && (currentUsage + quantity) > limit;
  const isOverage = limit !== -1 && currentUsage >= limit;

  if (limit === -1) {
    return { allowed: true, currentUsage, limit, remaining: Infinity, isOverage: false };
  }

  if (config.hardLimit && wouldExceed) {
    return {
      allowed: false,
      reason: `You've reached your ${formatResourceName(resourceType)} limit (${limit}). Upgrade your plan to add more.`,
      currentUsage, limit, remaining, isOverage: true,
      suggestedAction: 'upgrade',
      upgradeToPlans: findUpgradePlans(resourceType, currentUsage + quantity),
    };
  }

  const overageRate = getOverageRate(resourceType);
  return {
    allowed: true, currentUsage, limit, remaining, isOverage,
    overageRate: isOverage ? overageRate : undefined,
  };
}

async function getCurrentUsage(
  admin: any, organizationId: string, resourceType: ResourceType, plan: any, periodStart?: string
): Promise<{ currentUsage: number; limit: number }> {
  const periodStartDate = periodStart
    ? new Date(periodStart)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  switch (resourceType) {
    case 'sms': {
      const { count } = await admin.from('messages').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('type', 'sms').eq('direction', 'outbound')
        .gte('created_at', periodStartDate.toISOString());
      return { currentUsage: count || 0, limit: plan.features.smsPerMonth };
    }
    case 'email': {
      const { count } = await admin.from('messages').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('type', 'email').eq('direction', 'outbound')
        .gte('created_at', periodStartDate.toISOString());
      return { currentUsage: count || 0, limit: plan.features.emailsPerMonth };
    }
    case 'voice_drop': {
      const { count } = await admin.from('messages').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId).eq('type', 'voice_drop')
        .gte('created_at', periodStartDate.toISOString());
      return { currentUsage: count || 0, limit: plan.features.voiceDropsPerMonth };
    }
    case 'contact': {
      const { count } = await admin.from('contacts').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      return { currentUsage: count || 0, limit: plan.features.contacts };
    }
    case 'workflow': {
      const { count } = await admin.from('workflows').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      return { currentUsage: count || 0, limit: plan.features.workflows };
    }
    case 'booking_page': {
      const { count } = await admin.from('booking_pages').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      return { currentUsage: count || 0, limit: plan.features.bookingPages };
    }
    case 'team_member': {
      const { count } = await admin.from('organization_members').select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      return { currentUsage: count || 0, limit: plan.features.teamMembers };
    }
    default:
      return { currentUsage: 0, limit: 0 };
  }
}

function getOverageRate(resourceType: ResourceType): number {
  switch (resourceType) {
    case 'sms': return OVERAGE_PRICES.sms;
    case 'email': return OVERAGE_PRICES.email;
    case 'voice_drop': return OVERAGE_PRICES.voiceDrop;
    default: return 0;
  }
}

function formatResourceName(resourceType: ResourceType): string {
  const names: Record<ResourceType, string> = {
    sms: 'SMS messages', email: 'emails', voice_drop: 'voice drops',
    contact: 'contacts', workflow: 'workflows', booking_page: 'booking pages',
    team_member: 'team members',
  };
  return names[resourceType] || resourceType;
}

function findUpgradePlans(resourceType: ResourceType, neededAmount: number): string[] {
  return Object.values(PLANS).filter((plan) => {
    let limit: number;
    switch (resourceType) {
      case 'contact': limit = plan.features.contacts; break;
      case 'workflow': limit = plan.features.workflows; break;
      case 'booking_page': limit = plan.features.bookingPages; break;
      case 'team_member': limit = plan.features.teamMembers; break;
      default: limit = 0;
    }
    return limit === -1 || limit >= neededAmount;
  }).map((p) => p.id);
}

export async function enforceLimit<T>(
  organizationId: string, resourceType: ResourceType,
  action: () => Promise<T>, quantity: number = 1
): Promise<T> {
  const check = await checkUsageLimit(organizationId, resourceType, quantity);
  if (!check.allowed) throw new UsageLimitError(check.reason || 'Usage limit exceeded', check);
  return action();
}

export class UsageLimitError extends Error {
  public readonly usageCheck: UsageCheckResult;
  constructor(message: string, usageCheck: UsageCheckResult) {
    super(message);
    this.name = 'UsageLimitError';
    this.usageCheck = usageCheck;
  }
}

export async function getUsageWarnings(
  organizationId: string
): Promise<Array<{ resourceType: ResourceType; message: string; percent: number }>> {
  const warnings: Array<{ resourceType: ResourceType; message: string; percent: number }> = [];
  const types: ResourceType[] = ['sms', 'email', 'voice_drop', 'contact', 'workflow', 'booking_page', 'team_member'];

  for (const t of types) {
    const check = await checkUsageLimit(organizationId, t);
    const config = ENFORCEMENT_CONFIG[t];
    if (check.limit === -1) continue;
    const pct = (check.currentUsage / check.limit) * 100;
    if (pct >= config.warnAtPercent) {
      warnings.push({
        resourceType: t,
        message: `You've used ${Math.round(pct)}% of your ${formatResourceName(t)} (${check.currentUsage}/${check.limit})`,
        percent: pct,
      });
    }
  }
  return warnings.sort((a, b) => b.percent - a.percent);
}
