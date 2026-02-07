// @ts-nocheck
// ============================================
// Stripe client setup (browser + server)
// ============================================

import Stripe from "stripe";

// Server-side stripe instance
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
  typescript: true,
});

// For client-side - lazy load
export const getStripePublishableKey = () => {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
};

// Client-side stripe loader
export async function getStripeClient() {
  const { loadStripe } = await import('@stripe/stripe-js');
  return loadStripe(getStripePublishableKey());
}

// Redirect to checkout
export async function redirectToCheckout(sessionId: string) {
  const stripe = await getStripeClient();
  if (stripe) {
    await stripe.redirectToCheckout({ sessionId });
  }
}

// Redirect to customer portal
export async function redirectToPortal(url: string) {
  window.location.href = url;
}
