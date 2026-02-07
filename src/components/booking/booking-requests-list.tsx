'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreVertical, Phone, Mail, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-50 text-blue-700 ring-blue-600/15' },
  { value: 'contacted', label: 'Contacted', color: 'bg-amber-50 text-amber-700 ring-amber-600/15' },
  { value: 'quoted', label: 'Quoted', color: 'bg-purple-50 text-purple-700 ring-purple-600/15' },
  { value: 'booked', label: 'Booked', color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-600 ring-gray-300/30' },
];

export function BookingRequestsList({ requests: initial }: { requests: any[] }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState(initial);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = requests.filter(r => {
    const mf = filter === 'all' || r.status === filter;
    const ms = !search || r.customer_name?.toLowerCase().includes(search.toLowerCase()) || r.service_name?.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/booking/requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error();
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      toast({ title: `Status updated to ${status}` });
    } catch { toast({ title: 'Update failed', variant: 'destructive' }); }
  };

  const stats = { new: requests.filter(r => r.status === 'new').length, booked: requests.filter(r => r.status === 'booked').length, revenue: requests.filter(r => r.status === 'completed' && r.final_price).reduce((s, r) => s + r.final_price, 0) };

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-4 stagger-fade-in">
        {[
          { icon: Clock, value: stats.new, label: 'New Requests', ic: 'text-blue-600', bg: 'bg-blue-50' },
          { icon: CheckCircle, value: stats.booked, label: 'Booked', ic: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: DollarSign, value: `$${stats.revenue.toLocaleString()}`, label: 'Revenue', ic: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((s, i) => (
          <Card key={i}><CardContent className="pt-6"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}><s.icon className={`h-5 w-5 ${s.ic}`} /></div><div><p className="text-2xl font-bold tracking-tight">{s.value}</p><p className="text-sm text-gray-500">{s.label}</p></div></div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>All Requests</CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
              <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-400">No booking requests found</p></div>
          ) : (
            <div className="space-y-2">
              {filtered.map(req => (
                <div key={req.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 hover:border-gray-300 hover:shadow-soft transition-all duration-200">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{req.customer_name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400"><Phone className="h-3 w-3" />{req.customer_phone}</div>
                    </div>
                    <div className="hidden sm:block text-sm text-gray-600">{req.service_name}</div>
                    <div className="hidden md:block text-sm">
                      {req.final_price ? <span className="font-semibold text-emerald-600">${req.final_price}</span> : req.estimated_price ? <span>${req.estimated_price}</span> : <span className="text-gray-400">Quote</span>}
                    </div>
                    <Select value={req.status} onValueChange={(v) => updateStatus(req.id, v)}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Badge variant="outline" className="capitalize text-[10px] hidden lg:inline-flex">{req.source}</Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="ml-2"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.open(`tel:${req.customer_phone}`)}><Phone className="h-4 w-4 mr-2" />Call</DropdownMenuItem>
                      {req.customer_email && <DropdownMenuItem onClick={() => window.open(`mailto:${req.customer_email}`)}><Mail className="h-4 w-4 mr-2" />Email</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
