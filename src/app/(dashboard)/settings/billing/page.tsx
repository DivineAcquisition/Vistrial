"use client";

import { useState, useEffect } from "react";
import { RiCheckLine, RiCloseLine, RiLoader4Line, RiPhoneLine, RiMailLine, RiBankCardLine } from "@remixicon/react";

interface IntegrationStatus {
  twilio: {
    connected: boolean;
    phone?: string;
  };
  resend: {
    connected: boolean;
    domain?: string;
  };
  stripe: {
    connected: boolean;
    account_id?: string;
  };
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<IntegrationStatus>({
    twilio: { connected: false },
    resend: { connected: false },
    stripe: { connected: false },
  });

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch("/api/settings/integrations");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (error) {
        console.error("Failed to load integrations:", error);
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RiLoader4Line className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const integrations = [
    {
      name: "Twilio",
      description: "SMS messaging for quotes and follow-ups",
      icon: RiPhoneLine,
      connected: status.twilio.connected,
      details: status.twilio.phone ? `Phone: ${status.twilio.phone}` : null,
      color: "red",
    },
    {
      name: "Resend",
      description: "Transactional email delivery",
      icon: RiMailLine,
      connected: status.resend.connected,
      details: status.resend.domain ? `Domain: ${status.resend.domain}` : null,
      color: "blue",
    },
    {
      name: "Stripe",
      description: "Payment processing and invoicing",
      icon: RiBankCardLine,
      connected: status.stripe.connected,
      details: status.stripe.account_id ? `Account: ${status.stripe.account_id.slice(0, 12)}...` : null,
      color: "purple",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Integrations</h3>
          <p className="text-sm text-gray-500 mt-1">
            Connect third-party services to enhance your workflow.
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {integrations.map((integration) => (
            <div key={integration.name} className="p-6 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-${integration.color}-50 flex items-center justify-center`}>
                <integration.icon className={`w-6 h-6 text-${integration.color}-600`} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900">{integration.name}</h4>
                  {integration.connected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <RiCheckLine className="w-3 h-3" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <RiCloseLine className="w-3 h-3" />
                      Not connected
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {integration.description}
                </p>
                {integration.details && (
                  <p className="text-xs text-gray-400 mt-1 font-mono">
                    {integration.details}
                  </p>
                )}
              </div>

              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                {integration.connected ? "Configure" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Environment Variables Help */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h4 className="font-medium text-gray-900 mb-2">Setup Instructions</h4>
        <p className="text-sm text-gray-500 mb-4">
          Add the following environment variables to connect your services:
        </p>
        <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs text-gray-700 space-y-1">
          <p># Twilio</p>
          <p>TWILIO_ACCOUNT_SID=your_account_sid</p>
          <p>TWILIO_AUTH_TOKEN=your_auth_token</p>
          <p>TWILIO_PHONE_NUMBER=+1234567890</p>
          <p className="pt-2"># Resend</p>
          <p>RESEND_API_KEY=your_api_key</p>
          <p className="pt-2"># Stripe</p>
          <p>STRIPE_SECRET_KEY=your_secret_key</p>
          <p>STRIPE_WEBHOOK_SECRET=your_webhook_secret</p>
        </div>
      </div>
    </div>
  );
}
