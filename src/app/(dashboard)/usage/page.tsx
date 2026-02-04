/**
 * Usage Page
 * 
 * This page displays credit usage and billing information:
 * - Current credit balance with visual meter
 * - Usage breakdown by type (SMS, Voice, AI)
 * - Usage history with date range filtering
 * - Usage trends and charts
 * - Quick refill button
 * - Auto-refill settings
 * - Usage alerts and notifications
 */

import Link from "next/link";
import { 
  CreditCard,
  MessageSquare,
  Phone,
  Sparkles,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Calendar
} from "lucide-react";

export const dynamic = "force-dynamic";

// Placeholder usage data
const usageData = {
  credits: {
    remaining: 0,
    total: 1000,
    percentUsed: 0,
  },
  breakdown: {
    sms: { used: 0, cost: 0.02 },
    voice: { used: 0, cost: 0.10 },
    ai: { used: 0, cost: 0.05 },
  },
  history: [] as any[],
};

function UsageMeter({ remaining, total }: { remaining: number; total: number }) {
  const percentage = total > 0 ? ((total - remaining) / total) * 100 : 0;
  const isLow = percentage > 80;
  
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-4xl font-bold text-white">{remaining.toLocaleString()}</p>
          <p className="text-gray-400 text-sm">credits remaining</p>
        </div>
        <p className="text-gray-400 text-sm">of {total.toLocaleString()}</p>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            isLow ? "bg-gradient-to-r from-amber-500 to-red-500" : "bg-gradient-to-r from-violet-500 to-blue-500"
          }`}
          style={{ width: `${100 - percentage}%` }}
        />
      </div>
      {isLow && (
        <div className="flex items-center gap-2 text-amber-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Credits running low - consider adding more</span>
        </div>
      )}
    </div>
  );
}

export default async function UsagePage() {
  // TODO: Implement with credits.service.ts
  // - Fetch current credit balance
  // - Fetch usage history
  // - Calculate trends

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Usage & Credits</h1>
          <p className="text-gray-400 mt-1">
            Monitor your credit usage and manage billing
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-white/10 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
          >
            <CreditCard className="w-5 h-5" />
            Billing Settings
          </Link>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
            <RefreshCw className="w-5 h-5" />
            Add Credits
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credit Balance Card */}
        <div className="lg:col-span-2 bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Credit Balance</h2>
            <select className="px-3 py-1.5 bg-gray-800 border border-white/10 rounded-lg text-gray-300 text-sm">
              <option>This month</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
            </select>
          </div>
          <UsageMeter 
            remaining={usageData.credits.remaining} 
            total={usageData.credits.total} 
          />
        </div>

        {/* Quick Refill Card */}
        <div className="bg-gradient-to-br from-violet-500/10 via-purple-500/10 to-violet-500/5 rounded-2xl border border-violet-500/20 p-6">
          <h3 className="font-semibold text-white mb-4">Quick Refill</h3>
          <div className="space-y-3">
            <button className="w-full p-3 text-left bg-white/5 rounded-xl border border-white/10 hover:border-violet-500/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">500 credits</span>
                <span className="text-gray-400">$25</span>
              </div>
            </button>
            <button className="w-full p-3 text-left bg-white/5 rounded-xl border border-white/10 hover:border-violet-500/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">1,000 credits</span>
                <span className="text-gray-400">$45</span>
              </div>
            </button>
            <button className="w-full p-3 text-left bg-white/5 rounded-xl border border-white/10 hover:border-violet-500/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">5,000 credits</span>
                <span className="text-gray-400">$200</span>
              </div>
            </button>
          </div>
          <button className="w-full mt-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
            Purchase Credits
          </button>
        </div>
      </div>

      {/* Usage Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-gray-400">SMS Messages</p>
              <p className="text-2xl font-bold text-white">{usageData.breakdown.sms.used}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">${usageData.breakdown.sms.cost} per SMS</span>
            <span className="text-gray-400">${(usageData.breakdown.sms.used * usageData.breakdown.sms.cost).toFixed(2)} total</span>
          </div>
        </div>

        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Voice Minutes</p>
              <p className="text-2xl font-bold text-white">{usageData.breakdown.voice.used}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">${usageData.breakdown.voice.cost} per min</span>
            <span className="text-gray-400">${(usageData.breakdown.voice.used * usageData.breakdown.voice.cost).toFixed(2)} total</span>
          </div>
        </div>

        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-gray-400">AI Processing</p>
              <p className="text-2xl font-bold text-white">{usageData.breakdown.ai.used}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">${usageData.breakdown.ai.cost} per call</span>
            <span className="text-gray-400">${(usageData.breakdown.ai.used * usageData.breakdown.ai.cost).toFixed(2)} total</span>
          </div>
        </div>
      </div>

      {/* Usage History */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Usage History</h2>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 border border-white/10 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors">
            <Calendar className="w-4 h-4" />
            Date range
          </button>
        </div>
        
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
            <TrendingUp className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-2">No usage data yet</p>
          <p className="text-gray-500 text-sm">
            Usage will appear here as you use SMS, voice, and AI features
          </p>
        </div>
      </div>

      {/* Auto-Refill Settings */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white mb-1">Auto-Refill</h3>
            <p className="text-gray-400 text-sm">
              Automatically add credits when balance drops below threshold
            </p>
          </div>
          <Link 
            href="/settings/billing" 
            className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 font-medium text-sm"
          >
            Configure
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
