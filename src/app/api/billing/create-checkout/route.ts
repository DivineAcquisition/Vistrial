// @ts-nocheck
/**
 * Create Checkout Session API
 * 
 * Creates a Stripe Checkout session for:
 * - New subscription purchases
 * - Plan upgrades/downgrades
 * - One-time credit purchases
 * 
 * Request body:
 * - price_id: Stripe price ID
 * - mode: 'subscription' | 'payment'
 * - success_url?: Custom success redirect URL
 * - cancel_url?: Custom cancel redirect URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import Stripe from "stripe";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//   apiVersion: "2024-04-10",
// });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { price_id, mode: _mode = "subscription", success_url: _successUrl, cancel_url: _cancelUrl } = body;
    void _mode; void _successUrl; void _cancelUrl; // Reserved for implementation

    if (!price_id) {
      return NextResponse.json(
        { error: "Missing price_id" },
        { status: 400 }
      );
    }

    // TODO: Get or create Stripe customer for user
    // const { data: business } = await supabase
    //   .from("businesses")
    //   .select("stripe_customer_id")
    //   .eq("owner_id", user.id)
    //   .single();

    // let customerId = business?.stripe_customer_id;
    // if (!customerId) {
    //   const customer = await stripe.customers.create({
    //     email: user.email,
    //     metadata: { user_id: user.id },
    //   });
    //   customerId = customer.id;
    //   // Save customer ID to database
    // }

    // TODO: Create checkout session
    // const session = await stripe.checkout.sessions.create({
    //   customer: customerId,
    //   mode: mode as "subscription" | "payment",
    //   line_items: [{ price: price_id, quantity: 1 }],
    //   success_url: success_url || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    //   cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
    //   metadata: { user_id: user.id },
    // });

    return NextResponse.json({
      url: null, // session.url
    });
  } catch (error) {
    console.error("Create checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
