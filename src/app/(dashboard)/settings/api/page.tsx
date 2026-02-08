import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Key, Lock } from 'lucide-react';

export const metadata: Metadata = { title: 'API Keys | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function ApiSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <p className="text-gray-500 mt-1">Manage API keys for programmatic access</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> API Access</CardTitle>
          <CardDescription>Create and manage API keys for integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <Lock className="h-5 w-5 text-gray-400" />
            <div>
              <p className="font-medium text-sm text-gray-900">API access available on Pro and Agency plans</p>
              <p className="text-xs text-gray-500 mt-0.5">Upgrade your plan to generate API keys</p>
            </div>
            <Badge variant="secondary" className="ml-auto text-[10px]">Pro+</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
