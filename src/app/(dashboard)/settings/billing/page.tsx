"use client";

import { useState, useEffect } from "react";
import {
  RiCheckboxCircleLine,
  RiKeyLine,
  RiMessageLine,
  RiLoader4Line,
  RiAlertLine,
  RiMailLine,
} from "@remixicon/react";

interface IntegrationStatus {
  twilio: boolean;
  stripe: boolean;
  resend: boolean;
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<IntegrationStatus>({
    twilio: false,
    stripe: false,
    resend: false,
  });

  useEffect(() => {
    checkIntegrations();
  }, []);

  const checkIntegrations = async () => {
    try {
      const res = await fetch("/api/settings/integrations");
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (err) {
      console.error("Failed to check integrations:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RiLoader4Line className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Twilio Integration */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25">
                <RiMessageLine className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Twilio SMS</h3>
                <p className="text-sm text-gray-400">Send SMS notifications to customers</p>
              </div>
            </div>
            {status.twilio ? (
              <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1.5 text-sm font-medium text-green-400 border border-green-500/30">
                <RiCheckboxCircleLine className="h-4 w-4" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-400 border border-amber-500/30">
                <RiAlertLine className="h-4 w-4" />
                Not configured
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {status.twilio ? (
            <p className="text-sm text-gray-400">
              Your Twilio account is connected. SMS notifications are active.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Connect your Twilio account to enable SMS notifications for bookings, reminders, and follow-ups.
              </p>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-sm text-gray-500 mb-3">Add these environment variables to enable Twilio:</p>
                <code className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300 block mb-2">
                  TWILIO_ACCOUNT_SID=your_account_sid
                </code>
                <code className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300 block mb-2">
                  TWILIO_AUTH_TOKEN=your_auth_token
                </code>
                <code className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300 block">
                  TWILIO_PHONE_NUMBER=+1234567890
                </code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stripe Integration */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/25">
                <RiKeyLine className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Stripe Payments</h3>
                <p className="text-sm text-gray-400">Accept online payments from customers</p>
              </div>
            </div>
            {status.stripe ? (
              <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1.5 text-sm font-medium text-green-400 border border-green-500/30">
                <RiCheckboxCircleLine className="h-4 w-4" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-400 border border-amber-500/30">
                <RiAlertLine className="h-4 w-4" />
                Not configured
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {status.stripe ? (
            <p className="text-sm text-gray-400">
              Your Stripe account is connected. Online payments are enabled.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Connect Stripe to accept deposits and payments through your booking page.
              </p>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-sm text-gray-500 mb-3">Add this environment variable to enable Stripe:</p>
                <code className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300 block">
                  STRIPE_SECRET_KEY=sk_live_...
                </code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resend Email */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25">
                <RiMailLine className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Resend Email</h3>
                <p className="text-sm text-gray-400">Send email notifications and quotes</p>
              </div>
            </div>
            {status.resend ? (
              <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1.5 text-sm font-medium text-green-400 border border-green-500/30">
                <RiCheckboxCircleLine className="h-4 w-4" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-400 border border-amber-500/30">
                <RiAlertLine className="h-4 w-4" />
                Not configured
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {status.resend ? (
            <p className="text-sm text-gray-400">
              Your Resend account is connected. Email notifications are active.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Connect Resend to send email confirmations, quotes, and follow-ups.
              </p>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-sm text-gray-500 mb-3">Add this environment variable to enable Resend:</p>
                <code className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300 block">
                  RESEND_API_KEY=re_...
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
