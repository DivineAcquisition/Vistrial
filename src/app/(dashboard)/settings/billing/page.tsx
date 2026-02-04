/**
 * Billing Settings Page
 * 
 * This page manages subscription and payment settings:
 * - Current plan details and upgrade options
 * - Payment method management
 * - Invoice history and downloads
 * - Auto-refill configuration
 * - Billing address
 * - Usage-based billing details
 */

import Link from "next/link";
import { 
  ArrowLeft,
  CreditCard,
  Check,
  Plus,
  RefreshCw,
  Receipt
} from "lucide-react";

export const dynamic = "force-dynamic";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    description: "For small businesses getting started",
    features: [
      "500 SMS credits/month",
      "50 voice minutes/month",
      "1 workflow",
      "1,000 contacts",
      "Email support",
    ],
    current: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: 149,
    description: "For growing businesses with more needs",
    features: [
      "2,000 SMS credits/month",
      "200 voice minutes/month",
      "5 workflows",
      "10,000 contacts",
      "Priority support",
      "Advanced analytics",
    ],
    current: false,
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 399,
    description: "For larger operations and agencies",
    features: [
      "10,000 SMS credits/month",
      "1,000 voice minutes/month",
      "Unlimited workflows",
      "Unlimited contacts",
      "Dedicated support",
      "Custom integrations",
      "White-label options",
    ],
    current: false,
  },
];

export default async function BillingSettingsPage() {
  // TODO: Fetch billing info from Stripe via billing.service.ts
  // TODO: Get current subscription and usage

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
        <p className="text-gray-400 mt-1">
          Manage your subscription plan and payment methods
        </p>
      </div>

      {/* Current Plan */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Current Plan</h2>
          <span className="px-3 py-1 text-sm font-medium bg-green-500/20 text-green-400 rounded-full">
            Active
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-white">Starter</p>
            <p className="text-gray-400">$49/month · Renews on Feb 28, 2026</p>
          </div>
          <button className="px-4 py-2 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
            Upgrade Plan
          </button>
        </div>
      </div>

      {/* Plans Comparison */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border p-6 ${
                plan.popular 
                  ? "border-violet-500/50" 
                  : plan.current 
                    ? "border-green-500/30" 
                    : "border-white/10"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-600 text-white text-xs font-medium rounded-full">
                  Most Popular
                </div>
              )}
              {plan.current && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
                  Current Plan
                </div>
              )}
              
              <div className="mb-4">
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-gray-400 text-sm">{plan.description}</p>
              </div>
              
              <div className="mb-6">
                <span className="text-3xl font-bold text-white">${plan.price}</span>
                <span className="text-gray-400">/month</span>
              </div>
              
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <button
                className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
                  plan.current
                    ? "bg-gray-800 text-gray-400 cursor-default"
                    : plan.popular
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "bg-white/10 text-white hover:bg-white/20"
                }`}
                disabled={plan.current}
              >
                {plan.current ? "Current Plan" : "Upgrade"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Payment Method</h2>
          <button className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 font-medium text-sm">
            <Plus className="w-4 h-4" />
            Add new
          </button>
        </div>
        
        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="p-2 bg-gray-800 rounded-lg">
            <CreditCard className="w-6 h-6 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">•••• •••• •••• 4242</p>
            <p className="text-gray-400 text-sm">Expires 12/2028</p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded">
            Default
          </span>
        </div>
      </div>

      {/* Auto-Refill */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">Auto-Refill Credits</h2>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Automatically purchase more credits when your balance drops below a threshold.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              When balance falls below
            </label>
            <select className="w-full px-3 py-2.5 bg-gray-800 border border-white/10 rounded-xl text-white">
              <option>100 credits</option>
              <option>250 credits</option>
              <option>500 credits</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Refill amount
            </label>
            <select className="w-full px-3 py-2.5 bg-gray-800 border border-white/10 rounded-xl text-white">
              <option>500 credits ($25)</option>
              <option>1,000 credits ($45)</option>
              <option>5,000 credits ($200)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
              Enable Auto-Refill
            </button>
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Invoice History</h2>
          <button className="text-violet-400 hover:text-violet-300 font-medium text-sm">
            View all
          </button>
        </div>
        
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
            <Receipt className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-2">No invoices yet</p>
          <p className="text-gray-500 text-sm">
            Invoices will appear here after your first billing cycle
          </p>
        </div>
      </div>
    </div>
  );
}
