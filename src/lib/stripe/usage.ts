// ============================================
// USAGE TRACKING & METERED BILLING
// Track organization usage against plan limits
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { OVERAGE_PRICES, getPlanById } from './plans';

export interface UsageData {
  sms: { used: number; limit: number; overage: number };
  emails: { used: number; limit: number; overage: number };
  voiceDrops: { used: number; limit: number; overage: number };
  contacts: { used: number; limit: number };
  workflows: { used: number; limit: number };
  bookingPages: { used: number; limit: number };
}

/**
 * Get comprehensive usage data for an organization
 */
export async function getOrganizationUsage(
  organizationId: string
): Promise<UsageData> {
  const admin = getSupabaseAdminClient();

  // Get organization plan
  const { data: org } = await admin
    .from('organizations')
    .select('subscription_plan, subscription_current_period_start, plan_tier')
    .eq('id', organizationId)
    .single();

  const planId = org?.subscription_plan || org?.plan_tier || 'lite';
  const plan = getPlanById(planId);
  const periodStart = org?.subscription_current_period_start
    ? new Date(org.subscription_current_period_start)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Parallelize all count queries
  const [
    smsResult,
    emailResult,
    voiceResult,
    contactResult,
    workflowResult,
    bookingPageResult,
  ] = await Promise.all([
    // SMS sent this period
    admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('type', 'sms')
      .eq('direction', 'outbound')
      .gte('created_at', periodStart.toISOString()),

    // Emails sent this period
    admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('type', 'email')
      .eq('direction', 'outbound')
      .gte('created_at', periodStart.toISOString()),

    // Voice drops this period
    admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('type', 'voice_drop')
      .gte('created_at', periodStart.toISOString()),

    // Total contacts
    admin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId),

    // Workflows
    admin
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId),

    // Booking pages
    admin
      .from('booking_pages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
  ]);

  const smsUsed = smsResult.count || 0;
  const emailUsed = emailResult.count || 0;
  const voiceUsed = voiceResult.count || 0;

  const smsLimit = plan?.features.smsPerMonth || 500;
  const emailLimit = plan?.features.emailsPerMonth || 2000;
  const voiceLimit = plan?.features.voiceDropsPerMonth || 0;

  return {
    sms: {
      used: smsUsed,
      limit: smsLimit,
      overage: Math.max(0, smsUsed - smsLimit),
    },
    emails: {
      used: emailUsed,
      limit: emailLimit,
      overage: Math.max(0, emailUsed - emailLimit),
    },
    voiceDrops: {
      used: voiceUsed,
      limit: voiceLimit,
      overage: Math.max(0, voiceUsed - voiceLimit),
    },
    contacts: {
      used: contactResult.count || 0,
      limit: plan?.features.contacts || 500,
    },
    workflows: {
      used: workflowResult.count || 0,
      limit: plan?.features.workflows || 3,
    },
    bookingPages: {
      used: bookingPageResult.count || 0,
      limit: plan?.features.bookingPages || 1,
    },
  };
}

/**
 * Check if an organization is allowed to use a specific resource
 */
export async function checkUsageLimit(
  organizationId: string,
  type: 'sms' | 'email' | 'voiceDrop' | 'contact' | 'workflow' | 'bookingPage'
): Promise<{ allowed: boolean; remaining: number; overage: boolean }> {
  const usage = await getOrganizationUsage(organizationId);

  switch (type) {
    case 'sms':
      return {
        allowed: true, // Always allow, track overage
        remaining: Math.max(0, usage.sms.limit - usage.sms.used),
        overage: usage.sms.used >= usage.sms.limit,
      };
    case 'email':
      return {
        allowed: true,
        remaining: Math.max(0, usage.emails.limit - usage.emails.used),
        overage: usage.emails.used >= usage.emails.limit,
      };
    case 'voiceDrop':
      return {
        allowed: true,
        remaining: Math.max(0, usage.voiceDrops.limit - usage.voiceDrops.used),
        overage: usage.voiceDrops.used >= usage.voiceDrops.limit,
      };
    case 'contact': {
      return {
        allowed: usage.contacts.used < usage.contacts.limit,
        remaining: Math.max(0, usage.contacts.limit - usage.contacts.used),
        overage: false,
      };
    }
    case 'workflow': {
      const wLimit = usage.workflows.limit;
      return {
        allowed: wLimit === -1 || usage.workflows.used < wLimit,
        remaining:
          wLimit === -1
            ? Infinity
            : Math.max(0, wLimit - usage.workflows.used),
        overage: false,
      };
    }
    case 'bookingPage': {
      const pLimit = usage.bookingPages.limit;
      return {
        allowed: pLimit === -1 || usage.bookingPages.used < pLimit,
        remaining:
          pLimit === -1
            ? Infinity
            : Math.max(0, pLimit - usage.bookingPages.used),
        overage: false,
      };
    }
    default:
      return { allowed: true, remaining: Infinity, overage: false };
  }
}

/**
 * Calculate total overage charges for the current period
 */
export function calculateOverageCharges(usage: UsageData): number {
  let total = 0;

  if (usage.sms.overage > 0) {
    total += usage.sms.overage * OVERAGE_PRICES.sms;
  }
  if (usage.emails.overage > 0) {
    total += usage.emails.overage * OVERAGE_PRICES.email;
  }
  if (usage.voiceDrops.overage > 0) {
    total += usage.voiceDrops.overage * OVERAGE_PRICES.voiceDrop;
  }

  return Math.round(total * 100) / 100;
}
