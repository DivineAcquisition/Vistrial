// ============================================
// Payment intents and charges
// ============================================

import { stripe } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreatePaymentIntentParams {
  amount: number; // in cents
  businessId: string;
  bookingId: string;
  customerId?: string;
  customerEmail: string;
  description: string;
}

export async function createPaymentIntent({
  amount,
  businessId,
  bookingId,
  customerId,
  customerEmail,
  description,
}: CreatePaymentIntentParams) {
  const supabase = createAdminClient();

  // Get business Stripe account
  const { data: business } = await supabase
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .single();

  if (!business?.stripe_account_id) {
    throw new Error("Business has not connected Stripe");
  }

  // Calculate platform fee (2.5% for Vistrial)
  const platformFee = Math.round(amount * 0.025);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    customer: customerId,
    receipt_email: customerEmail,
    description,
    metadata: {
      business_id: businessId,
      booking_id: bookingId,
    },
    application_fee_amount: platformFee,
    transfer_data: {
      destination: business.stripe_account_id,
    },
  });

  return paymentIntent;
}

// Create or get Stripe customer
export async function getOrCreateCustomer(
  email: string,
  name: string,
  phone: string,
  contactId: string
) {
  const supabase = createAdminClient();

  // Check if contact already has Stripe customer ID
  const { data: contact } = await supabase
    .from("contacts")
    .select("stripe_customer_id")
    .eq("id", contactId)
    .single();

  if (contact?.stripe_customer_id) {
    return contact.stripe_customer_id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    phone,
    metadata: {
      contact_id: contactId,
    },
  });

  // Save to contact
  await supabase
    .from("contacts")
    .update({ stripe_customer_id: customer.id })
    .eq("id", contactId);

  return customer.id;
}

// Confirm payment was successful
export async function confirmPayment(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.status === "succeeded";
}
