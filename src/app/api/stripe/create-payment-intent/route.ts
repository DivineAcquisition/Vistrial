// ============================================
// API route to create payment intent
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  createPaymentIntent,
  getOrCreateCustomer,
} from "@/lib/stripe/payments";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      businessId,
      bookingId,
      contactId,
      amount,
      customerEmail,
      customerName,
      customerPhone,
      description,
    } = body;

    if (!businessId || !bookingId || !contactId || !amount || !customerEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateCustomer(
      customerEmail,
      customerName,
      customerPhone,
      contactId
    );

    // Create payment intent
    const paymentIntent = await createPaymentIntent({
      amount: Math.round(amount * 100), // Convert to cents
      businessId,
      bookingId,
      customerId,
      customerEmail,
      description: description || "Cleaning service deposit",
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Create payment intent error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
