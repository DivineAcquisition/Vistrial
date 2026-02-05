/**
 * Refill Settings Component
 * 
 * Auto-refill configuration panel with:
 * - Enable/disable toggle
 * - Threshold selector (when to refill)
 * - Amount selector (how much to add)
 * - Payment method display
 * - Save settings button
 * 
 * Used in: /settings/billing page, /usage page
 */

"use client";

import { useState } from "react";
import { RefreshCw, CreditCard, AlertCircle, Check } from "lucide-react";

interface RefillSettingsProps {
  enabled: boolean;
  threshold: number;
  refillAmount: number;
  paymentMethod?: {
    brand: string;
    last4: string;
  };
  onSave: (settings: RefillSettings) => Promise<void>;
}

interface RefillSettings {
  enabled: boolean;
  threshold: number;
  refillAmount: number;
}

const thresholdOptions = [50, 100, 250, 500];
const refillOptions = [
  { credits: 500, price: 25 },
  { credits: 1000, price: 45 },
  { credits: 2500, price: 100 },
  { credits: 5000, price: 200 },
];

export function RefillSettings({ 
  enabled: initialEnabled, 
  threshold: initialThreshold, 
  refillAmount: initialRefillAmount,
  paymentMethod,
  onSave 
}: RefillSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [refillAmount, setRefillAmount] = useState(initialRefillAmount);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ enabled, threshold, refillAmount });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const selectedRefill = refillOptions.find(o => o.credits === refillAmount) || refillOptions[0];

  return (
    <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
          <RefreshCw className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Auto-Refill</h3>
          <p className="text-sm text-gray-400">
            Automatically add credits when balance is low
          </p>
        </div>
      </div>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl mb-6">
        <span className="text-white font-medium">Enable Auto-Refill</span>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            enabled ? "bg-brand-600" : "bg-gray-700"
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-6">
          {/* Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Refill when balance falls below
            </label>
            <div className="grid grid-cols-4 gap-2">
              {thresholdOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setThreshold(option)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    threshold === option
                      ? "bg-brand-600 text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {option} credits
                </button>
              ))}
            </div>
          </div>

          {/* Refill Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Amount to refill
            </label>
            <div className="grid grid-cols-2 gap-3">
              {refillOptions.map((option) => (
                <button
                  key={option.credits}
                  onClick={() => setRefillAmount(option.credits)}
                  className={`p-4 rounded-xl text-left transition-colors ${
                    refillAmount === option.credits
                      ? "bg-brand-600 text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <div className="text-lg font-semibold">
                    {option.credits.toLocaleString()} credits
                  </div>
                  <div className={refillAmount === option.credits ? "text-brand-200" : "text-gray-500"}>
                    ${option.price}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className="p-4 bg-white/5 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-gray-400" />
                {paymentMethod ? (
                  <span className="text-white">
                    {paymentMethod.brand} •••• {paymentMethod.last4}
                  </span>
                ) : (
                  <span className="text-amber-400">No payment method</span>
                )}
              </div>
              <button className="text-sm text-brand-400 hover:text-brand-300">
                Change
              </button>
            </div>
          </div>

          {/* Warning */}
          {!paymentMethod && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              Add a payment method to enable auto-refill
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {enabled && paymentMethod && (
        <div className="mt-6 p-4 bg-brand-500/10 border border-brand-500/20 rounded-xl">
          <p className="text-brand-300 text-sm">
            When your balance drops below <strong>{threshold} credits</strong>, we&apos;ll automatically charge{" "}
            <strong>${selectedRefill.price}</strong> to add{" "}
            <strong>{selectedRefill.credits.toLocaleString()} credits</strong>.
          </p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end mt-6 pt-6 border-t border-white/5">
        <button
          onClick={handleSave}
          disabled={saving || (!enabled && !initialEnabled)}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saved ? (
            <>
              <Check className="w-5 h-5" />
              Saved!
            </>
          ) : saving ? (
            "Saving..."
          ) : (
            "Save Settings"
          )}
        </button>
      </div>
    </div>
  );
}
