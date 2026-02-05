// @ts-nocheck
// ============================================
// STRIPE WEBHOOK HANDLER
// Processes Stripe webhook events
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { constructWebhookEvent, stripe } from '@/lib/stripe/server';
import {
  getOrganizationByStripeCustomerId,
} from '@/lib/supabase/admin';
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionCanceled,
} from '@/services/billing.service';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(body, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionEvent(subscription, 'created');
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionEvent(subscription, 'updated');
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionEvent(subscription, 'deleted');
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        // Credit refills are handled inline, but log for monitoring
        if (paymentIntent.metadata?.type === 'credit_refill') {
          console.log('Credit refill payment succeeded:', paymentIntent.id);
        }
        // Handle booking deposits
        const bookingId = paymentIntent.metadata?.booking_id;
        if (bookingId) {
          await admin
            .from('bookings')
            .update({
              deposit_paid: true,
              deposit_paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntent.id,
              payment_status: 'deposit_paid',
            })
            .eq('id', bookingId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.booking_id;
        if (bookingId) {
          await admin
            .from('bookings')
            .update({ payment_status: 'failed' })
            .eq('id', bookingId);
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const businessId = account.metadata?.business_id;
        if (businessId) {
          await admin
            .from('businesses')
            .update({
              stripe_charges_enabled: account.charges_enabled,
              stripe_payouts_enabled: account.payouts_enabled,
              stripe_details_submitted: account.details_submitted,
            })
            .eq('id', businessId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') {
    return;
  }

  const organizationId = session.metadata?.organization_id;

  if (!organizationId) {
    console.error('No organization_id in checkout session metadata');
    return;
  }

  // Subscription details will be handled by subscription.created webhook
  console.log('Checkout completed for organization:', organizationId);
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
  eventType: 'created' | 'updated' | 'deleted'
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const organization = await getOrganizationByStripeCustomerId(customerId);

  if (!organization) {
    console.error('No organization found for customer:', customerId);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;

  if (eventType === 'created') {
    await handleSubscriptionCreated({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      priceId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });
  } else if (eventType === 'updated') {
    await handleSubscriptionUpdated({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      priceId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  } else if (eventType === 'deleted') {
    await handleSubscriptionCanceled({
      organizationId: organization.id,
    });
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const organization = await getOrganizationByStripeCustomerId(customerId);

  if (organization) {
    console.log('Invoice paid for organization:', organization.id, invoice.id);
  }

  // Handle membership invoice (legacy)
  const admin = getSupabaseAdminClient();
  const membershipId =
    (invoice as any).subscription_details?.metadata?.membership_id ||
    (invoice as any).lines?.data?.[0]?.metadata?.membership_id;

  if (membershipId) {
    const { data: membership } = await admin
      .from('memberships')
      .select('*')
      .eq('id', membershipId)
      .single();

    if (membership) {
      const nextDate = membership.next_service_date || new Date().toISOString().split('T')[0];

      await admin.from('bookings').insert({
        business_id: membership.business_id,
        contact_id: membership.contact_id,
        membership_id: membershipId,
        service_type_id: membership.service_type_id,
        scheduled_date: nextDate,
        scheduled_time: membership.preferred_time || '09:00',
        address_line1: membership.address_line1,
        city: membership.city,
        state: membership.state,
        zip: membership.zip,
        bedrooms: membership.bedrooms,
        bathrooms: membership.bathrooms,
        has_pets: membership.has_pets,
        status: 'confirmed',
        total: membership.price_per_service,
        payment_status: 'paid',
        source: 'membership',
      });

      const frequencyDaysMap: Record<string, number> = {
        weekly: 7,
        biweekly: 14,
        monthly: 30,
      };
      const frequencyDays = frequencyDaysMap[membership.frequency] || 14;
      const nextServiceDate = new Date(nextDate);
      nextServiceDate.setDate(nextServiceDate.getDate() + frequencyDays);

      await admin
        .from('memberships')
        .update({ next_service_date: nextServiceDate.toISOString().split('T')[0] })
        .eq('id', membershipId);
    }
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const organization = await getOrganizationByStripeCustomerId(customerId);

  if (organization) {
    console.error('Invoice payment failed for organization:', organization.id, invoice.id);
    // TODO: Send notification email to organization
  }

  // Handle membership invoice (legacy)
  const admin = getSupabaseAdminClient();
  const membershipId =
    (invoice as any).subscription_details?.metadata?.membership_id ||
    (invoice as any).lines?.data?.[0]?.metadata?.membership_id;

  if (membershipId) {
    await admin
      .from('memberships')
      .update({ status: 'past_due' })
      .eq('id', membershipId);
  }
}
