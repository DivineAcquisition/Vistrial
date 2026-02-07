// @ts-nocheck
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Calendar, DollarSign, ExternalLink, ArrowRight, Inbox } from 'lucide-react';

export const metadata: Metadata = { title: 'Booking Pages | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function BookingDashboardPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const admin = getSupabaseAdminClient();
  const orgId = context.organization.id;

  const [{ data: bookingPages }, { data: recentRequests }, { count: totalRequests }, { count: newRequests }, { data: revenueData }] = await Promise.all([
    admin.from('booking_pages').select('*, pricing_matrices(name)').eq('organization_id', orgId).order('created_at', { ascending: false }),
    admin.from('booking_requests').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
    admin.from('booking_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('booking_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'new'),
    admin.from('booking_requests').select('final_price').eq('organization_id', orgId).eq('status', 'completed').not('final_price', 'is', null),
  ]);

  const totalRevenue = revenueData?.reduce((sum, r) => sum + (r.final_price || 0), 0) || 0;

  return (
    <div className="space-y-6 dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Booking Pages</h1>
          <p className="text-gray-500 text-sm mt-1">Create booking forms with dynamic pricing for your customers</p>
        </div>
        <div className="flex gap-2">
          <Link href="/booking/pricing"><Button variant="outline"><FileText className="h-4 w-4 mr-2" />Manage Pricing</Button></Link>
          <Link href="/booking/new"><Button variant="gradient"><Plus className="h-4 w-4 mr-2" />New Booking Page</Button></Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4 stagger-fade-in">
        {[
          { icon: FileText, value: bookingPages?.length || 0, label: 'Booking Pages', bg: 'bg-brand-50', ic: 'text-brand-600' },
          { icon: Inbox, value: totalRequests || 0, label: 'Total Requests', bg: 'bg-purple-50', ic: 'text-purple-600' },
          { icon: Calendar, value: newRequests || 0, label: 'New Requests', bg: 'bg-amber-50', ic: 'text-amber-600' },
          { icon: DollarSign, value: `$${totalRevenue.toLocaleString()}`, label: 'Revenue Tracked', bg: 'bg-emerald-50', ic: 'text-emerald-600' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}><s.icon className={`h-5 w-5 ${s.ic}`} /></div>
                <div><p className="text-2xl font-bold tracking-tight">{s.value}</p><p className="text-sm text-gray-500">{s.label}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Your Booking Pages</CardTitle><CardDescription>Create and manage booking pages for your services</CardDescription></CardHeader>
            <CardContent>
              {!bookingPages || bookingPages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4 border border-gray-100"><FileText className="h-7 w-7 text-gray-300" /></div>
                  <h3 className="font-semibold mb-1">No booking pages yet</h3>
                  <p className="text-sm text-gray-500 mb-4">Create your first booking page to start accepting online bookings</p>
                  <Link href="/booking/new"><Button variant="gradient"><Plus className="h-4 w-4 mr-2" />Create Booking Page</Button></Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookingPages.map((page) => (
                    <div key={page.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 hover:border-gray-300 hover:shadow-soft transition-all duration-200">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (page.customization?.primaryColor || '#5347d1') + '15' }}>
                          <FileText className="h-5 w-5" style={{ color: page.customization?.primaryColor || '#5347d1' }} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{page.name}</p>
                          <p className="text-xs text-gray-400">vistrial.io/book/{page.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={page.active ? 'success' : 'secondary'}>{page.active ? 'Active' : 'Inactive'}</Badge>
                        <a href={`/book/${page.slug}`} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon"><ExternalLink className="h-4 w-4" /></Button></a>
                        <Link href={`/booking/${page.id}`}><Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button></Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between"><CardTitle className="text-base">Recent Requests</CardTitle><Link href="/booking/requests"><Button variant="ghost" size="sm">View All<ArrowRight className="h-4 w-4 ml-1" /></Button></Link></div>
            </CardHeader>
            <CardContent>
              {!recentRequests || recentRequests.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No booking requests yet</p>
              ) : (
                <div className="space-y-2">
                  {recentRequests.map((req) => (
                    <div key={req.id} className="p-3 rounded-xl border border-gray-200/80 hover:border-gray-300 transition-all duration-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{req.customer_name}</p>
                        <Badge variant={req.status === 'new' ? 'default' : req.status === 'booked' ? 'success' : 'secondary'} className="text-[10px]">{req.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{req.service_name}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{new Date(req.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
