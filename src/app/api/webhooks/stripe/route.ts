// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPaymentFailedNotice } from "@/lib/twilio/messages";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      // ============================================
      // PAYMENT INTENT EVENTS
      // ============================================
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.booking_id;

        if (bookingId) {
          await admin
            .from("bookings")
            .update({
              deposit_paid: true,
              deposit_paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntent.id,
              payment_status: "deposit_paid",
            })
            .eq("id", bookingId);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.booking_id;

        if (bookingId) {
          await admin
            .from("bookings")
            .update({ payment_status: "failed" })
            .eq("id", bookingId);
        }
        break;
      }

      // ============================================
      // SUBSCRIPTION EVENTS
      // ============================================
      case "customer.subscription.created": {
        const subscription = event.data.object as any;
        const membershipId = subscription.metadata?.membership_id;

        if (membershipId) {
          const updateData: Record<string, any> = {
            status: "active",
            stripe_subscription_id: subscription.id,
          };

          if (subscription.current_period_start) {
            updateData.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
          }
          if (subscription.current_period_end) {
            updateData.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
          }

          await admin
            .from("memberships")
            .update(updateData)
            .eq("id", membershipId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        const membershipId = subscription.metadata?.membership_id;

        if (membershipId) {
          let status = "active";
          if (subscription.cancel_at_period_end) status = "canceling";
          if (subscription.status === "past_due") status = "past_due";
          if (subscription.status === "canceled") status = "canceled";
          if (subscription.pause_collection) status = "paused";

          const updateData: Record<string, any> = { status };

          if (subscription.current_period_start) {
            updateData.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
          }
          if (subscription.current_period_end) {
            updateData.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
          }

          await admin
            .from("memberships")
            .update(updateData)
            .eq("id", membershipId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const membershipId = subscription.metadata?.membership_id;

        if (membershipId) {
          await admin
            .from("memberships")
            .update({ status: "canceled", canceled_at: new Date().toISOString() })
            .eq("id", membershipId);
        }
        break;
      }

      // ============================================
      // INVOICE EVENTS (for recurring payments)
      // ============================================
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const membershipId = invoice.subscription_details?.metadata?.membership_id ||
                             invoice.lines?.data?.[0]?.metadata?.membership_id;

        if (membershipId) {
          // Create a booking for this payment cycle
          const { data: membership } = await admin
            .from("memberships")
            .select("*")
            .eq("id", membershipId)
            .single();

          if (membership) {
            // Calculate next service date
            const nextDate = membership.next_service_date || new Date().toISOString().split("T")[0];

            await admin.from("bookings").insert({
              business_id: membership.business_id,
              contact_id: membership.contact_id,
              membership_id: membershipId,
              service_type_id: membership.service_type_id,
              scheduled_date: nextDate,
              scheduled_time: membership.preferred_time || "09:00",
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
              source: "membership",
            });

            // Update next service date based on frequency
            const frequencyDaysMap: Record<string, number> = {
              weekly: 7,
              biweekly: 14,
              monthly: 30,
            };
            const frequencyDays = frequencyDaysMap[membership.frequency] || 14;
            const nextServiceDate = new Date(nextDate);
            nextServiceDate.setDate(nextServiceDate.getDate() + frequencyDays);

            await admin
              .from("memberships")
              .update({ next_service_date: nextServiceDate.toISOString().split("T")[0] })
              .eq("id", membershipId);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const membershipId = invoice.subscription_details?.metadata?.membership_id ||
                             invoice.lines?.data?.[0]?.metadata?.membership_id;

        if (membershipId) {
          await admin
            .from("memberships")
            .update({ status: "past_due" })
            .eq("id", membershipId);

          // Send SMS notification
          await sendPaymentFailedNotice(membershipId);
        }
        break;
      }

      // ============================================
      // CONNECT ACCOUNT EVENTS
      // ============================================
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const businessId = account.metadata?.business_id;

        if (businessId) {
          await admin
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
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
