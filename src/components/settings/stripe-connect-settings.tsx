// ============================================
// Stripe Connect UI component
// ============================================

"use client";

import { useState } from "react";
import {
  CreditCard,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface StripeConnectSettingsProps {
  business: {
    id: string;
    stripe_account_id: string | null;
    stripe_charges_enabled: boolean;
    stripe_payouts_enabled: boolean;
    stripe_details_submitted: boolean;
  };
}

export function StripeConnectSettings({
  business,
}: StripeConnectSettingsProps) {
  const [loading, setLoading] = useState(false);

  const isConnected =
    business.stripe_account_id && business.stripe_charges_enabled;

  const handleConnect = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Connect error:", error);
    }
    setLoading(false);
  };

  const openDashboard = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/stripe/dashboard", { method: "POST" });
      const data = await response.json();

      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Dashboard error:", error);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Payment Settings
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Connect Stripe to accept payments
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              isConnected
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-slate-100 dark:bg-slate-800"
            }`}
          >
            <CreditCard
              className={`h-6 w-6 ${
                isConnected
                  ? "text-green-600 dark:text-green-400"
                  : "text-slate-400"
              }`}
            />
          </div>

          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Stripe Connect
            </h2>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Accept credit card payments and manage payouts
            </p>

            {isConnected ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">
                    Connected and ready to accept payments
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    {business.stripe_charges_enabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                    Charges
                  </span>
                  <span className="flex items-center gap-1">
                    {business.stripe_payouts_enabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                    Payouts
                  </span>
                </div>

                <button
                  onClick={openDashboard}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Stripe Dashboard
                </button>
              </div>
            ) : (
              <div className="mt-4">
                {business.stripe_account_id &&
                  !business.stripe_details_submitted && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      <AlertCircle className="mr-1 inline h-4 w-4" />
                      Your Stripe account setup is incomplete. Click below to
                      continue.
                    </div>
                  )}

                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CreditCard className="h-5 w-5" />
                  )}
                  {business.stripe_account_id
                    ? "Complete Setup"
                    : "Connect with Stripe"}
                </button>

                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  You&apos;ll be redirected to Stripe to complete the setup
                  process.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pricing Info */}
      <div className="rounded-xl border bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">
          Payment Processing Fees
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              Stripe processing
            </span>
            <span className="text-slate-900 dark:text-slate-100">
              2.9% + 30¢
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              Vistrial platform fee
            </span>
            <span className="text-slate-900 dark:text-slate-100">2.5%</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium dark:border-slate-700">
            <span className="text-slate-700 dark:text-slate-300">
              Total per transaction
            </span>
            <span className="text-slate-900 dark:text-slate-100">
              5.4% + 30¢
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
