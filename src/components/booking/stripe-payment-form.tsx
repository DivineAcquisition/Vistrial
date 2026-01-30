// ============================================
// Stripe Elements payment form
// ============================================

"use client";

import { useState, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2, Lock } from "lucide-react";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface StripePaymentFormProps {
  businessId: string;
  bookingId: string;
  contactId: string;
  amount: number;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  brandColor?: string;
}

export function StripePaymentForm(props: StripePaymentFormProps) {
  const {
    businessId,
    bookingId,
    contactId,
    amount,
    customerEmail,
    customerName,
    customerPhone,
    onError,
    brandColor,
    onSuccess,
  } = props;

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Create payment intent
    fetch("/api/stripe/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        bookingId,
        contactId,
        amount,
        customerEmail,
        customerName,
        customerPhone,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          onError(data.error);
        } else {
          setClientSecret(data.clientSecret);
        }
        setLoading(false);
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Failed to initialize payment";
        setError(message);
        onError(message);
        setLoading(false);
      });
  }, [
    businessId,
    bookingId,
    contactId,
    amount,
    customerEmail,
    customerName,
    customerPhone,
    onError,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-600">
        {error || "Failed to initialize payment. Please try again."}
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: brandColor || "#7c3aed",
          },
        },
      }}
    >
      <CheckoutForm
        onSuccess={onSuccess}
        onError={onError}
        brandColor={brandColor}
      />
    </Elements>
  );
}

function CheckoutForm({
  onSuccess,
  onError,
  brandColor,
}: {
  onSuccess: () => void;
  onError: (error: string) => void;
  brandColor?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/booking/confirmation`,
      },
      redirect: "if_required",
    });

    if (error) {
      onError(error.message || "Payment failed");
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      <button
        type="submit"
        disabled={!stripe || processing}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: brandColor || "#7c3aed" }}
      >
        {processing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Pay Now
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1 text-center text-xs text-slate-500">
        <Lock className="h-3 w-3" />
        Secured by Stripe
      </p>
    </form>
  );
}
