// ============================================
// Stripe webhook handler
// ============================================

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilio/client";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      // Payment successful
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        if (bookingId) {
          // Update booking payment status
          await supabase
            .from("bookings")
            .update({
              deposit_paid: true,
              payment_status: "deposit_paid",
              stripe_payment_intent_id: paymentIntent.id,
            })
            .eq("id", bookingId);

          // Get booking details for SMS
          const { data: booking } = await supabase
            .from("bookings")
            .select(
              `
              *,
              contacts(phone, first_name),
              businesses(name)
            `
            )
            .eq("id", bookingId)
            .single();

          if (booking?.contacts?.phone) {
            // Send payment confirmation SMS
            const formattedDate = new Date(
              booking.scheduled_date
            ).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });

            await sendSMS(
              booking.contacts.phone,
              `✅ Payment received! Your ${booking.businesses.name} cleaning is confirmed for ${formattedDate}. We'll text you a reminder the day before!`
            );
          }
        }
        break;
      }

      // Payment failed
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        if (bookingId) {
          await supabase
            .from("bookings")
            .update({ payment_status: "failed" })
            .eq("id", bookingId);
        }
        break;
      }

      // Subscription created
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const membershipId = subscription.metadata.membership_id;

        if (membershipId) {
          await supabase
            .from("memberships")
            .update({
              stripe_subscription_id: subscription.id,
              status: "active",
            })
            .eq("id", membershipId);
        }
        break;
      }

      // Subscription payment succeeded (recurring charge)
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Get subscription ID from parent or subscription_details
        const subscriptionId =
          invoice.parent?.subscription_details?.subscription ||
          (invoice as unknown as { subscription: string | null }).subscription;

        if (subscriptionId) {
          // Find membership
          const { data: membership } = await supabase
            .from("memberships")
            .select(
              `
              *,
              contacts(phone, first_name),
              businesses(name)
            `
            )
            .eq("stripe_subscription_id", subscriptionId)
            .single();

          if (membership) {
            // Create next booking
            const nextDate = new Date(membership.next_service_date);
            nextDate.setDate(nextDate.getDate() + membership.frequency_days);

            await supabase.from("bookings").insert({
              business_id: membership.business_id,
              contact_id: membership.contact_id,
              service_type_id: membership.service_type_id,
              membership_id: membership.id,
              scheduled_date: membership.next_service_date,
              scheduled_time: membership.preferred_time,
              address_line1: membership.address_line1,
              city: membership.city,
              state: membership.state,
              zip: membership.zip,
              bedrooms: membership.bedrooms,
              bathrooms: membership.bathrooms,
              has_pets: membership.has_pets,
              status: "confirmed",
              total: membership.price_per_service,
              payment_status: "paid",
            });

            // Update next service date
            await supabase
              .from("memberships")
              .update({
                next_service_date: nextDate.toISOString().split("T")[0],
              })
              .eq("id", membership.id);
          }
        }
        break;
      }

      // Subscription payment failed
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Get subscription ID from parent or subscription_details
        const subscriptionId =
          invoice.parent?.subscription_details?.subscription ||
          (invoice as unknown as { subscription: string | null }).subscription;

        if (subscriptionId) {
          const { data: membership } = await supabase
            .from("memberships")
            .select(
              `
              *,
              contacts(phone, first_name),
              businesses(name)
            `
            )
            .eq("stripe_subscription_id", subscriptionId)
            .single();

          if (membership) {
            // Update membership status
            await supabase
              .from("memberships")
              .update({ status: "payment_failed" })
              .eq("id", membership.id);

            // Notify customer
            if (membership.contacts?.phone) {
              await sendSMS(
                membership.contacts.phone,
                `⚠️ Hi ${membership.contacts.first_name}, your payment for ${membership.businesses.name} cleaning couldn't be processed. Please update your payment method to avoid service interruption.`
              );
            }
          }
        }
        break;
      }

      // Subscription cancelled
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const membershipId = subscription.metadata.membership_id;

        if (membershipId) {
          await supabase
            .from("memberships")
            .update({ status: "cancelled" })
            .eq("id", membershipId);
        }
        break;
      }

      // Connect account updated
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const businessId = account.metadata?.business_id;

        if (businessId) {
          await supabase
            .from("businesses")
            .update({
              stripe_charges_enabled: account.charges_enabled,
              stripe_payouts_enabled: account.payouts_enabled,
              stripe_details_submitted: account.details_submitted,
            })
            .eq("id", businessId);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
