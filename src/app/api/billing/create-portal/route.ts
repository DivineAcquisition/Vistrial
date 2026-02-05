// @ts-nocheck
/**
 * Create Customer Portal Session API
 * 
 * Creates a Stripe Customer Portal session for users to:
 * - View and download invoices
 * - Update payment methods
 * - Cancel or modify subscriptions
 * - View billing history
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import Stripe from "stripe";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//   apiVersion: "2024-04-10",
// });

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Get Stripe customer ID from database
    // const { data: business } = await supabase
    //   .from("businesses")
    //   .select("stripe_customer_id")
    //   .eq("owner_id", user.id)
    //   .single();

    // if (!business?.stripe_customer_id) {
    //   return NextResponse.json(
    //     { error: "No billing account found" },
    //     { status: 400 }
    //   );
    // }

    // TODO: Create portal session
    // const session = await stripe.billingPortal.sessions.create({
    //   customer: business.stripe_customer_id,
    //   return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    // });

    return NextResponse.json({
      url: null, // session.url
    });
  } catch (error) {
    console.error("Create portal error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
