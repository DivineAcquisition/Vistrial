// @ts-nocheck
// ============================================
// SUPABASE ADMIN CLIENT
// Used for server-side operations that bypass RLS
// ============================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    // Build-time mock
    const mock = (): any => ({ select: mock, insert: mock, update: mock, delete: mock, upsert: mock, eq: mock, neq: mock, gt: mock, gte: mock, lt: mock, lte: mock, in: mock, order: mock, limit: mock, range: mock, filter: mock, match: mock, not: mock, is: mock, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }) });
    return { auth: { admin: { createUser: async () => ({ data: null, error: null }), deleteUser: async () => ({ error: null }), getUserById: async () => ({ data: null, error: null }) } }, from: () => mock(), rpc: async () => ({ data: null, error: null }) } as any;
  }

  adminClient = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

// Backward compatibility alias
export const createAdminClient = getSupabaseAdminClient;

// Convenience export
export const adminDb = () => getSupabaseAdminClient();

// Helper functions
export async function getOrganizationByStripeCustomerId(stripeCustomerId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('organizations').select('*').eq('stripe_customer_id', stripeCustomerId).single();
  return data;
}

export async function getOrganizationByStripeSubscriptionId(subscriptionId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('organizations').select('*').eq('stripe_subscription_id', subscriptionId).single();
  return data;
}

export async function updateOrganizationSubscription(organizationId: string, updates: Record<string, any>) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('organizations').update(updates).eq('id', organizationId).select().single();
  return data;
}

export async function getCreditBalance(organizationId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('credit_balances').select('*').eq('organization_id', organizationId).single();
  return data;
}

export async function addCreditsAdmin(organizationId: string, amountCents: number, isPurchase = true) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.rpc('add_credits', { p_organization_id: organizationId, p_amount_cents: amountCents, p_is_purchase: isPurchase });
  return data as number;
}

export async function deductCreditsAdmin(organizationId: string, amountCents: number, description?: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.rpc('deduct_credits', { p_organization_id: organizationId, p_amount_cents: amountCents, p_description: description || null });
  return data as boolean;
}

export async function createTransaction(transaction: Record<string, any>) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('transactions').insert(transaction).select().single();
  return data;
}

export async function getOrganizationsNeedingRefill() {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('credit_balances').select('*, organizations(id, name, stripe_customer_id, subscription_status)').eq('auto_refill_enabled', true);
  return (data || []).filter((cb: any) => cb.balance_cents <= cb.refill_threshold_cents && cb.organizations?.stripe_customer_id && cb.organizations?.subscription_status === 'active');
}

export async function getContactByPhone(organizationId: string, phone: string) {
  const admin = getSupabaseAdminClient();
  const normalized = phone.replace(/\D/g, '');
  const variants = [phone, normalized, `+${normalized}`, `+1${normalized}`, normalized.slice(-10)];
  const { data } = await admin.from('contacts').select('*').eq('organization_id', organizationId).in('phone', variants).limit(1).single();
  return data;
}

export async function getPendingMessages(limit = 100) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('message_queue').select('*, contacts(*), organizations(*)').eq('status', 'pending').lte('scheduled_for', new Date().toISOString()).lt('attempts', 3).order('scheduled_for', { ascending: true }).limit(limit);
  return data || [];
}

export async function updateMessageQueueItem(id: string, updates: Record<string, any>) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('message_queue').update(updates).eq('id', id).select().single();
  return data;
}

export async function updateEnrollmentNextAction(enrollmentId: string, nextActionAt: string | null, currentStepIndex: number) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('workflow_enrollments').update({ next_action_at: nextActionAt, current_step_index: currentStepIndex }).eq('id', enrollmentId).select().single();
  return data;
}

export async function getEnrollmentsToProcess(limit = 100) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('workflow_enrollments').select('*, contacts(*), workflows(*, organizations(*))').eq('status', 'active').lte('next_action_at', new Date().toISOString()).order('next_action_at', { ascending: true }).limit(limit);
  return data || [];
}

export async function createMessage(message: Record<string, any>) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('messages').insert({ ...message, queued_at: new Date().toISOString() }).select().single();
  return data;
}

export async function updateMessageStatus(messageId: string, updates: Record<string, any>) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('messages').update(updates).eq('id', messageId).select().single();
  return data;
}

export async function getMessageByProviderId(providerMessageId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('messages').select('*').eq('provider_message_id', providerMessageId).single();
  return data;
}
