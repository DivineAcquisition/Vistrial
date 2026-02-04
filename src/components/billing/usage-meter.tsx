/**
 * Usage Meter Component
 * 
 * Visual credit usage display with:
 * - Progress bar showing usage
 * - Numeric credit display
 * - Low balance warning
 * - Usage breakdown by type
 * - Quick refill button
 * 
 * Used in: Dashboard, /usage page, sidebar
 */

"use client";

import { AlertCircle, RefreshCw, MessageSquare, Phone, Sparkles } from "lucide-react";
import Link from "next/link";

interface UsageMeterProps {
  credits: {
    remaining: number;
    total: number;
  };
  breakdown?: {
    sms: number;
    voice: number;
    ai: number;
  };
  showRefill?: boolean;
  compact?: boolean;
}

export function UsageMeter({ credits, breakdown, showRefill = true, compact = false }: UsageMeterProps) {
  const percentUsed = credits.total > 0 ? ((credits.total - credits.remaining) / credits.total) * 100 : 0;
  const percentRemaining = 100 - percentUsed;
  const isLow = percentRemaining < 20;
  const isCritical = percentRemaining < 10;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                isCritical 
                  ? "bg-red-500" 
                  : isLow 
                    ? "bg-amber-500" 
                    : "bg-gradient-to-r from-violet-500 to-blue-500"
              }`}
              style={{ width: `${percentRemaining}%` }}
            />
          </div>
        </div>
        <span className={`text-sm font-medium ${isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-white"}`}>
          {credits.remaining}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Credit Balance</h3>
        {showRefill && (
          <Link
            href="/usage"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Add Credits
          </Link>
        )}
      </div>

      {/* Main Display */}
      <div className="mb-4">
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className={`text-4xl font-bold ${
              isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-white"
            }`}>
              {credits.remaining.toLocaleString()}
            </span>
            <span className="text-gray-400 ml-2">credits remaining</span>
          </div>
          <span className="text-gray-500 text-sm">of {credits.total.toLocaleString()}</span>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              isCritical 
                ? "bg-gradient-to-r from-red-600 to-red-400" 
                : isLow 
                  ? "bg-gradient-to-r from-amber-600 to-amber-400" 
                  : "bg-gradient-to-r from-violet-500 to-blue-500"
            }`}
            style={{ width: `${percentRemaining}%` }}
          />
        </div>
      </div>

      {/* Warning */}
      {isLow && (
        <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
          isCritical ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
        }`}>
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">
            {isCritical 
              ? "Critical: Credits almost depleted. Add more to continue messaging." 
              : "Credits running low. Consider adding more soon."}
          </span>
        </div>
      )}

      {/* Breakdown */}
      {breakdown && (
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
              <MessageSquare className="w-3 h-3" />
              <span className="text-xs">SMS</span>
            </div>
            <p className="text-lg font-semibold text-white">{breakdown.sms}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
              <Phone className="w-3 h-3" />
              <span className="text-xs">Voice</span>
            </div>
            <p className="text-lg font-semibold text-white">{breakdown.voice}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
              <Sparkles className="w-3 h-3" />
              <span className="text-xs">AI</span>
            </div>
            <p className="text-lg font-semibold text-white">{breakdown.ai}</p>
          </div>
        </div>
      )}
    </div>
  );
}
