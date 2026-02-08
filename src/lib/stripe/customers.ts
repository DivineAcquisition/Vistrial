// ============================================
// STRIPE CUSTOMER MANAGEMENT
// Create, retrieve, and update Stripe customers
// ============================================

import { getStripeServerClient } from './server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Create or get a Stripe customer for an organization
 * Checks the database first, creates in Stripe if needed
 */
export async function createOrGetStripeCustomerForOrg(
  organizationId: string,
  email: string,
  name: string
): Promise<string> {
  const admin = getSupabaseAdminClient();
  const stripe = getStripeServerClient();

  // Check if organization already has a Stripe customer
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', organizationId)
    .single();

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      organization_id: organizationId,
      source: 'vistrial',
    },
  });

  // Save to database
  await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', organizationId);

  return customer.id;
}

/**
 * Get a Stripe customer by ID
 */
export async function getStripeCustomerById(customerId: string) {
  const stripe = getStripeServerClient();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as any).deleted) return null;
    return customer;
  } catch {
    return null;
  }
}

/**
 * Update a Stripe customer
 */
export async function updateStripeCustomerById(
  customerId: string,
  data: { email?: string; name?: string }
) {
  const stripe = getStripeServerClient();
  return stripe.customers.update(customerId, data);
}
