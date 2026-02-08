import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ExternalLink, ArrowRight } from 'lucide-react';

export const metadata: Metadata = { title: 'Booking Settings | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function BookingSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Booking Settings</h1>
        <p className="text-gray-500 mt-1">Manage your booking pages and scheduling preferences</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Booking Pages</CardTitle>
          <CardDescription>Manage your public-facing booking pages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Go to your booking page manager to create and customize booking pages.</p>
            <Link href="/booking">
              <Button variant="outline" size="sm" className="rounded-xl">
                Manage Pages <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
