// @ts-nocheck
// ============================================
// SUPABASE ADMIN CLIENT
// Used for server-side operations that bypass RLS
// Only use in secure server contexts (webhooks, cron jobs, etc.)
// ============================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Singleton pattern for admin client
let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdminClient() {
  if (adminClient) {
    return adminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    // Return a mock client for build time
    const mockChain = (): unknown => ({
      select: mockChain,
      insert: mockChain,
      update: mockChain,
      delete: mockChain,
      upsert: mockChain,
      eq: mockChain,
      neq: mockChain,
      gt: mockChain,
      gte: mockChain,
      lt: mockChain,
      lte: mockChain,
      in: mockChain,
      order: mockChain,
      limit: mockChain,
      range: mockChain,
      filter: mockChain,
      match: mockChain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    });

    return {
      auth: {
        admin: {
          createUser: async () => ({ data: null, error: null }),
          deleteUser: async () => ({ error: null }),
        },
      },
      from: () => mockChain(),
      rpc: async () => ({ data: null, error: null }),
    } as unknown as ReturnType<typeof createClient<Database>>;
  }

  adminClient = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

// Backward compatibility alias
export const createAdminClient = getSupabaseAdminClient;

// ============================================
// ADMIN HELPER FUNCTIONS
// ============================================

/**
 * Get organization by Stripe customer ID (for webhook processing)
 */
export async function getOrganizationByStripeCustomerId(stripeCustomerId: string) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (error) {
    console.error('Error fetching organization by Stripe customer ID:', error);
    return null;
  }

  return data;
}

/**
 * Get organization by Stripe subscription ID
 */
export async function getOrganizationByStripeSubscriptionId(subscriptionId: string) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (error) {
    console.error('Error fetching organization by subscription ID:', error);
    return null;
  }

  return data;
}

/**
 * Update organization subscription status
 */
export async function updateOrganizationSubscription(
  organizationId: string,
  updates: {
    subscription_status?: string;
    plan_tier?: string;
    contact_limit?: number;
    current_period_start?: string;
    current_period_end?: string;
    stripe_subscription_id?: string;
  }
) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('organizations')
    .update(updates)
    .eq('id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Error updating organization subscription:', error);
    throw error;
  }

  return data;
}

/**
 * Get credit balance for an organization
 */
export async function getCreditBalance(organizationId: string) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('credit_balances')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    console.error('Error fetching credit balance:', error);
    return null;
  }

  return data;
}

/**
 * Add credits to an organization (bypasses RLS)
 */
export async function addCreditsAdmin(
  organizationId: string,
  amountCents: number,
  isPurchase: boolean = true
) {
  const admin = getSupabaseAdminClient();

  // Use the database function for atomic operation
  const { data, error } = await admin.rpc('add_credits', {
    p_organization_id: organizationId,
    p_amount_cents: amountCents,
    p_is_purchase: isPurchase,
  });

  if (error) {
    console.error('Error adding credits:', error);
    throw error;
  }

  return data as number; // Returns new balance
}

/**
 * Deduct credits from an organization (bypasses RLS)
 */
export async function deductCreditsAdmin(
  organizationId: string,
  amountCents: number,
  description?: string
) {
  const admin = getSupabaseAdminClient();

  // Use the database function for atomic operation
  const { data, error } = await admin.rpc('deduct_credits', {
    p_organization_id: organizationId,
    p_amount_cents: amountCents,
    p_description: description || null,
  });

  if (error) {
    console.error('Error deducting credits:', error);
    throw error;
  }

  return data as boolean; // Returns success/failure
}

/**
 * Create a transaction record
 */
export async function createTransaction(transaction: {
  organization_id: string;
  type: string;
  amount_cents: number;
  status: string;
  stripe_payment_intent_id?: string;
  stripe_invoice_id?: string;
  stripe_charge_id?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('transactions')
    .insert(transaction)
    .select()
    .single();

  if (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }

  return data;
}

/**
 * Get organizations that need credit refill
 */
export async function getOrganizationsNeedingRefill() {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('credit_balances')
    .select(`
      *,
      organizations (
        id,
        name,
        stripe_customer_id,
        subscription_status
      )
    `)
    .eq('auto_refill_enabled', true)
    .filter('balance_cents', 'lte', 'refill_threshold_cents');

  if (error) {
    console.error('Error fetching organizations needing refill:', error);
    return [];
  }

  // Filter out orgs without active subscriptions or Stripe customer
  return data.filter(
    (cb) =>
      cb.organizations &&
      (cb.organizations as unknown as { stripe_customer_id: string | null; subscription_status: string }).stripe_customer_id &&
      (cb.organizations as unknown as { subscription_status: string }).subscription_status === 'active'
  );
}

/**
 * Get contact by phone number for inbound message matching
 */
export async function getContactByPhone(organizationId: string, phone: string) {
  const admin = getSupabaseAdminClient();

  // Normalize phone number (remove non-digits, handle various formats)
  const normalizedPhone = phone.replace(/\D/g, '');
  const phoneVariants = [
    phone,
    normalizedPhone,
    `+${normalizedPhone}`,
    `+1${normalizedPhone}`,
    normalizedPhone.slice(-10), // Last 10 digits
  ];

  const { data, error } = await admin
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId)
    .in('phone', phoneVariants)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching contact by phone:', error);
  }

  return data;
}

/**
 * Get pending messages from queue that are ready to send
 */
export async function getPendingMessages(limit: number = 100) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('message_queue')
    .select(`
      *,
      contacts (
        id,
        first_name,
        last_name,
        phone,
        email,
        status,
        sms_opted_in,
        email_opted_in,
        voice_opted_in
      ),
      organizations (
        id,
        name,
        phone,
        settings
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .lt('attempts', 3)
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching pending messages:', error);
    return [];
  }

  return data;
}

/**
 * Update message queue item status
 */
export async function updateMessageQueueItem(
  id: string,
  updates: {
    status?: string;
    attempts?: number;
    last_attempt_at?: string;
    error_message?: string;
    message_id?: string;
    processed_at?: string;
  }
) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('message_queue')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating message queue item:', error);
    throw error;
  }

  return data;
}

/**
 * Bulk update enrollment next action times
 */
export async function updateEnrollmentNextAction(
  enrollmentId: string,
  nextActionAt: string | null,
  currentStepIndex: number
) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('workflow_enrollments')
    .update({
      next_action_at: nextActionAt,
      current_step_index: currentStepIndex,
    })
    .eq('id', enrollmentId)
    .select()
    .single();

  if (error) {
    console.error('Error updating enrollment:', error);
    throw error;
  }

  return data;
}

/**
 * Get active enrollments that need processing
 */
export async function getEnrollmentsToProcess(limit: number = 100) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('workflow_enrollments')
    .select(`
      *,
      contacts (
        id,
        first_name,
        last_name,
        phone,
        email,
        status,
        sms_opted_in,
        email_opted_in,
        voice_opted_in
      ),
      workflows (
        id,
        name,
        status,
        steps,
        settings,
        organizations (
          id,
          name,
          phone,
          email,
          settings,
          timezone
        )
      )
    `)
    .eq('status', 'active')
    .lte('next_action_at', new Date().toISOString())
    .order('next_action_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching enrollments to process:', error);
    return [];
  }

  return data;
}

/**
 * Create a message record
 */
export async function createMessage(message: {
  organization_id: string;
  contact_id: string;
  workflow_id?: string;
  enrollment_id?: string;
  step_index?: number;
  type: string;
  status: string;
  to_address: string;
  from_address?: string;
  content: string;
  audio_url?: string;
  provider?: string;
  cost_cents?: number;
}) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('messages')
    .insert({
      ...message,
      queued_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating message:', error);
    throw error;
  }

  return data;
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  messageId: string,
  updates: {
    status?: string;
    sent_at?: string;
    delivered_at?: string;
    failed_at?: string;
    provider_message_id?: string;
    provider_status?: string;
    provider_error?: string;
    cost_cents?: number;
  }
) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('messages')
    .update(updates)
    .eq('id', messageId)
    .select()
    .single();

  if (error) {
    console.error('Error updating message status:', error);
    throw error;
  }

  return data;
}

/**
 * Get message by provider message ID
 */
export async function getMessageByProviderId(providerMessageId: string) {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('provider_message_id', providerMessageId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching message by provider ID:', error);
  }

  return data;
}
