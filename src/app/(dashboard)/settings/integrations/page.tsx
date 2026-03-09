import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { RiLinkM, RiExternalLinkLine, RiCheckLine } from '@remixicon/react';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

const integrations = [
  {
    id: 'ghl',
    name: 'GoHighLevel',
    description: 'Sync contacts and trigger workflows from GHL pipeline stages.',
    category: 'CRM',
    status: 'available' as const,
  },
  {
    id: 'jobber',
    name: 'Jobber',
    description: 'Automatically trigger follow-ups when jobs are completed.',
    category: 'Field Service',
    status: 'available' as const,
  },
  {
    id: 'housecall',
    name: 'Housecall Pro',
    description: 'Connect job statuses and client data from Housecall Pro.',
    category: 'Field Service',
    status: 'available' as const,
  },
  {
    id: 'servicetitan',
    name: 'ServiceTitan',
    description: 'Sync completed jobs and customer records from ServiceTitan.',
    category: 'Field Service',
    status: 'available' as const,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect to 5,000+ apps through Zapier webhooks.',
    category: 'Automation',
    status: 'available' as const,
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    description: 'Send events from any tool to your Vistrial webhook URL.',
    category: 'Developer',
    status: 'available' as const,
  },
];

export default async function IntegrationsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const org = context.organization as Record<string, any>;
  const webhookUrl = `https://app.vistrial.io/api/webhooks/jobs?org=${org.id}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-500 mt-1">Connect your tools to automate workflows</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <RiLinkM className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold text-gray-900 text-sm">Your Webhook URL</h3>
        </div>
        <div className="flex gap-2">
          <code className="flex-1 text-xs bg-white p-3 rounded-lg border border-gray-200 font-mono break-all text-gray-600">
            {webhookUrl}
          </code>
        </div>
        <p className="text-xs text-gray-400">
          Paste this URL in your tool&apos;s webhook settings to send events to Vistrial.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => (
          <div
            key={integration.id}
            className="rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-sm hover:border-gray-300"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{integration.name}</h3>
                <span className="text-[11px] text-gray-400">{integration.category}</span>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
                Via Webhook
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{integration.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
