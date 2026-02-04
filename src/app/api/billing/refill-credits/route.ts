/**
 * Refill Credits API
 * 
 * Handles credit refill purchases:
 * - POST: Purchase additional credits
 * 
 * Request body:
 * - amount: Number of credits to purchase
 * - auto_refill?: Boolean to enable auto-refill after this purchase
 * 
 * This endpoint can be called:
 * - Manually by user from the usage page
 * - Automatically by the check-balances cron job when auto-refill is enabled
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import Stripe from "stripe";
// import { creditsService } from "@/services/credits.service";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//   apiVersion: "2024-04-10",
// });

// Credit packages with pricing
const CREDIT_PACKAGES = {
  500: { price: 2500, price_id: "price_credits_500" }, // $25
  1000: { price: 4500, price_id: "price_credits_1000" }, // $45
  5000: { price: 20000, price_id: "price_credits_5000" }, // $200
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { amount, auto_refill: _autoRefill } = body;
    void _autoRefill; // Reserved for implementation

    // Validate amount
    if (!amount || !Object.keys(CREDIT_PACKAGES).includes(String(amount))) {
      return NextResponse.json(
        { error: "Invalid credit amount. Choose 500, 1000, or 5000." },
        { status: 400 }
      );
    }

    const _package = CREDIT_PACKAGES[amount as keyof typeof CREDIT_PACKAGES];
    void _package; // Reserved for implementation

    // TODO: Get Stripe customer ID
    // TODO: Charge using saved payment method
    // TODO: Add credits to user's balance
    // TODO: Update auto-refill settings if specified

    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: package_.price,
    //   currency: "usd",
    //   customer: stripeCustomerId,
    //   payment_method: defaultPaymentMethodId,
    //   confirm: true,
    //   metadata: {
    //     user_id: user.id,
    //     credits: amount,
    //     type: "credit_refill",
    //   },
    // });

    // await creditsService.addCredits(user.id, amount, {
    //   type: "purchase",
    //   payment_intent_id: paymentIntent.id,
    // });

    return NextResponse.json({
      success: true,
      credits_added: amount,
      new_balance: 0, // creditsService.getBalance(user.id)
    });
  } catch (error) {
    console.error("Refill credits error:", error);
    return NextResponse.json(
      { error: "Failed to refill credits" },
      { status: 500 }
    );
  }
}
