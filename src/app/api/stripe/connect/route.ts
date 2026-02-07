// ============================================
// Stripe Connect onboarding
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createConnectAccount,
  createAccountLink,
  getAccountStatus,
} from "@/lib/stripe/connect";

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Check if already has Stripe account
    if (business.stripe_account_id) {
      // Generate new onboarding link
      const url = await createAccountLink(
        business.stripe_account_id,
        business.slug
      );
      return NextResponse.json({ url });
    }

    // Create new Connect account
    const account = await createConnectAccount(business.id, business.email);
    const url = await createAccountLink(account.id, business.slug);

    return NextResponse.json({ url, accountId: account.id });
  } catch (error) {
    console.error("Stripe Connect error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to connect Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("stripe_account_id")
      .eq("owner_id", user.id)
      .single();

    if (!business?.stripe_account_id) {
      return NextResponse.json({ connected: false });
    }

    const status = await getAccountStatus(business.stripe_account_id);
    return NextResponse.json({
      connected: true,
      ...status,
    });
  } catch (error) {
    console.error("Get Stripe status error:", error);
    return NextResponse.json({ connected: false });
  }
}
