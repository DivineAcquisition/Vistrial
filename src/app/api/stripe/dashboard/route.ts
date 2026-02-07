// ============================================
// Stripe Connect Dashboard link
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createDashboardLink } from "@/lib/stripe/connect";

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
      .select("stripe_account_id")
      .eq("owner_id", user.id)
      .single();

    if (!business?.stripe_account_id) {
      return NextResponse.json(
        { error: "Stripe not connected" },
        { status: 400 }
      );
    }

    const url = await createDashboardLink(business.stripe_account_id);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Create dashboard link error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create dashboard link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
