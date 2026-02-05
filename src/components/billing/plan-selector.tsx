/**
 * Plan Selector Component
 * 
 * Displays subscription plan options with:
 * - Plan cards with features comparison
 * - Monthly/annual toggle
 * - Current plan highlight
 * - Upgrade/downgrade buttons
 * - Popular plan badge
 * - Price display with discounts
 * 
 * Used in: /settings/billing page, upgrade modals
 */

"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_annual: number;
  features: string[];
  popular?: boolean;
}

interface PlanSelectorProps {
  plans: Plan[];
  currentPlanId?: string;
  onSelect: (planId: string, interval: "monthly" | "annual") => void;
  loading?: boolean;
}

export function PlanSelector({ plans, currentPlanId, onSelect, loading }: PlanSelectorProps) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="space-y-6">
      {/* Interval Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={`text-sm ${interval === "monthly" ? "text-white" : "text-gray-400"}`}>
          Monthly
        </span>
        <button
          onClick={() => setInterval(interval === "monthly" ? "annual" : "monthly")}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            interval === "annual" ? "bg-brand-600" : "bg-gray-700"
          }`}
        >
          <div
            className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
              interval === "annual" ? "left-8" : "left-1"
            }`}
          />
        </button>
        <span className={`text-sm ${interval === "annual" ? "text-white" : "text-gray-400"}`}>
          Annual
          <span className="ml-1 text-green-400 text-xs">(Save 20%)</span>
        </span>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const price = interval === "monthly" ? plan.price_monthly : plan.price_annual / 12;

          return (
            <div
              key={plan.id}
              className={`relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border p-6 ${
                plan.popular 
                  ? "border-brand-500/50" 
                  : isCurrent 
                    ? "border-green-500/30" 
                    : "border-white/10"
              }`}
            >
              {/* Badges */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-600 text-white text-xs font-medium rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Most Popular
                </div>
              )}
              {isCurrent && !plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
                  Current Plan
                </div>
              )}

              {/* Content */}
              <div className="mb-4">
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-gray-400 text-sm mt-1">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">${Math.round(price)}</span>
                <span className="text-gray-400">/month</span>
                {interval === "annual" && (
                  <p className="text-green-400 text-sm mt-1">
                    ${plan.price_annual}/year (billed annually)
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Button */}
              <button
                onClick={() => onSelect(plan.id, interval)}
                disabled={isCurrent || loading}
                className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
                  isCurrent
                    ? "bg-gray-800 text-gray-400 cursor-default"
                    : plan.popular
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {isCurrent ? "Current Plan" : loading ? "Loading..." : "Select Plan"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
