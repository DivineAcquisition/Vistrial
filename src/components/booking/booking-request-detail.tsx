'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, Clock, DollarSign, User, FileText, MessageSquare, CheckCircle, XCircle, Send, Loader2, Plus, Sparkles, Tag, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils/cn';

interface Props { request: any; activities: any[]; pricingMatrix: any; organizationId: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: 'New', color: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/15', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15', icon: Phone },
  quoted: { label: 'Quoted', color: 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/15', icon: DollarSign },
  booked: { label: 'Booked', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15', icon: CheckCircle },
  completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-300/30', icon: XCircle },
};

export function BookingRequestDetail({ request, activities: initialActivities, pricingMatrix, organizationId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState(request.status);
  const [finalPrice, setFinalPrice] = useState(request.final_price?.toString() || '');
  const [internalNotes, setInternalNotes] = useState(request.internal_notes || '');
  const [activities, setActivities] = useState(initialActivities);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [showQuickSms, setShowQuickSms] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);

  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  const StatusIcon = sc.icon;
  const serviceDetails = pricingMatrix?.services?.find((s: any) => s.id === request.service_id);
  const firstName = request.customer_name?.split(' ')[0] || 'there';

  const addActivity = async (type: string, content: string) => {
    try {
      const res = await fetch(`/api/booking/requests/${request.id}/activity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, content }) });
      if (res.ok) { const data = await res.json(); setActivities([data.activity, ...activities]); }
    } catch {}
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/booking/requests/${request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, finalPrice: finalPrice ? parseFloat(finalPrice) : null, notes: internalNotes }) });
      if (!res.ok) throw new Error();
      if (status !== request.status) await addActivity('status_change', `Status changed to ${STATUS_CONFIG[status]?.label}`);
      toast({ title: 'Changes saved!' }); router.refresh();
    } catch { toast({ title: 'Save failed', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    try { await addActivity('note', newNote); setNewNote(''); toast({ title: 'Note added' }); }
    catch { toast({ title: 'Failed', variant: 'destructive' }); }
    finally { setIsAddingNote(false); }
  };

  const handleMarkBooked = async () => {
    if (!finalPrice) { toast({ title: 'Enter final price first', variant: 'destructive' }); return; }
    setStatus('booked'); await handleSave(); await addActivity('booked', `Job booked for $${finalPrice}`);
  };

  const handleMarkCompleted = async () => {
    setStatus('completed'); await handleSave(); await addActivity('completed', `Job completed. Revenue: $${finalPrice || request.estimated_price}`);
  };

  const getActivityIcon = (type: string) => {
    const map: Record<string, any> = { status_change: History, note: FileText, sms_sent: MessageSquare, email_sent: Mail, call: Phone, booked: CheckCircle, completed: CheckCircle };
    const Icon = map[type] || Clock;
    return <Icon className={cn('h-4 w-4', type === 'booked' || type === 'completed' ? 'text-emerald-600' : '')} />;
  };

  return (
    <div className="space-y-6 dashboard-page">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/booking/requests"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-3"><h1 className="text-2xl font-bold tracking-tight">{request.customer_name}</h1><Badge className={sc.color}><StatusIcon className="h-3 w-3 mr-1" />{sc.label}</Badge></div>
            <p className="text-sm text-gray-500">{request.service_name} · Requested {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowQuickSms(true)}><MessageSquare className="h-4 w-4 mr-2" />Send SMS</Button>
          <Button onClick={handleSave} disabled={isSaving} variant="gradient">{isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}Save Changes</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Customer Information</CardTitle></CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center"><User className="h-4 w-4 text-brand-600" /></div>
                    <div><p className="font-semibold text-sm">{request.customer_name}</p>{request.contact_id && <Link href={`/contacts/${request.contact_id}`} className="text-xs text-brand-600 hover:underline">View Contact Profile →</Link>}</div>
                  </div>
                  <a href={`tel:${request.customer_phone}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><Phone className="h-4 w-4 text-emerald-600" /></div>
                    <div><p className="font-medium text-sm">{request.customer_phone}</p><p className="text-[11px] text-gray-400">Click to call</p></div>
                  </a>
                  {request.customer_email && (
                    <a href={`mailto:${request.customer_email}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Mail className="h-4 w-4 text-blue-600" /></div>
                      <div><p className="font-medium text-sm">{request.customer_email}</p><p className="text-[11px] text-gray-400">Click to email</p></div>
                    </a>
                  )}
                </div>
                <div className="space-y-3">
                  {request.customer_address && (
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center mt-0.5"><MapPin className="h-4 w-4 text-purple-600" /></div>
                      <div><p className="font-medium text-sm">Service Address</p><p className="text-sm text-gray-500">{request.customer_address}</p></div>
                    </div>
                  )}
                  {request.preferred_date && (
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center mt-0.5"><Calendar className="h-4 w-4 text-amber-600" /></div>
                      <div><p className="font-medium text-sm">Preferred Date</p><p className="text-sm text-gray-500">{format(new Date(request.preferred_date), 'EEEE, MMMM d, yyyy')}{request.preferred_time && ` · ${request.preferred_time}`}</p><Badge variant="outline" className="mt-1 text-[10px] capitalize">{request.flexibility || 'flexible'}</Badge></div>
                    </div>
                  )}
                </div>
              </div>
              {request.customer_notes && <div className="mt-4 p-3 bg-gray-50 rounded-xl"><p className="text-xs font-medium text-gray-600 mb-1">Customer Notes</p><p className="text-sm text-gray-500">{request.customer_notes}</p></div>}
            </CardContent>
          </Card>

          {/* Service Details */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Service Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div><p className="font-semibold text-lg">{request.service_name}</p>{serviceDetails?.description && <p className="text-sm text-gray-500">{serviceDetails.description}</p>}</div>
                <div className="text-right"><p className="text-xs text-gray-400">Base Price</p><p className="font-semibold">${serviceDetails?.basePrice || '—'}</p></div>
              </div>
              {request.selected_options && Object.keys(request.selected_options).length > 0 && (
                <div><p className="text-sm font-medium mb-2">Selected Options</p><div className="space-y-2">{Object.entries(request.selected_options).map(([key, value]) => {
                  const v = serviceDetails?.variables?.find((x: any) => x.id === key);
                  const o = v?.options?.find((x: any) => x.value === value || x.id === value);
                  return <div key={key} className="flex items-center justify-between text-sm"><span className="text-gray-500">{v?.name || key}</span><span className="font-medium">{o?.label || String(value)}</span></div>;
                })}</div></div>
              )}
              {request.selected_add_ons?.length > 0 && (
                <div><p className="text-sm font-medium mb-2">Add-ons</p><div className="space-y-2">{request.selected_add_ons.map((id: string) => {
                  const a = serviceDetails?.addOns?.find((x: any) => x.id === id);
                  return <div key={id} className="flex items-center justify-between text-sm"><span className="text-gray-500">{a?.name || id}</span><span className="font-medium">+${a?.price || '—'}</span></div>;
                })}</div></div>
              )}
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-gray-500">Estimated Price</span><span className="font-medium">{request.price_type === 'quote' ? <Badge variant="secondary">Quote Required</Badge> : `$${request.estimated_price}`}</span></div>
                {request.final_price && <div className="flex items-center justify-between text-emerald-600"><span className="font-medium">Final Price</span><span className="font-bold text-lg">${request.final_price}</span></div>}
              </div>
            </CardContent>
          </Card>

          {/* Attribution */}
          {(request.source !== 'direct' || request.campaign_id) && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Attribution</CardTitle></CardHeader>
              <CardContent><div className="flex items-center gap-4"><Badge variant="outline" className="capitalize"><Tag className="h-3 w-3 mr-1" />{request.source}</Badge>{request.workflow_id && <Link href={`/workflows/${request.workflow_id}`} className="text-sm text-brand-600 hover:underline">View Campaign →</Link>}{request.booking_pages && <span className="text-sm text-gray-500">via {request.booking_pages.name}</span>}</div></CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Activity</CardTitle></div></CardHeader>
            <CardContent>
              <div className="mb-4 space-y-2">
                <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note about this booking..." rows={2} />
                {newNote && <div className="flex justify-end"><Button size="sm" onClick={handleAddNote} disabled={isAddingNote}>{isAddingNote ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Add Note</Button></div>}
              </div>
              <div className="space-y-4">
                {activities.map((a, i) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center"><div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">{getActivityIcon(a.type)}</div>{i < activities.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-2" />}</div>
                    <div className="flex-1 pb-4"><p className="text-sm text-gray-700">{a.content}</p><p className="text-[11px] text-gray-400 mt-1">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p></div>
                  </div>
                ))}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100"><Plus className="h-4 w-4 text-blue-600" /></div>
                  <div><p className="text-sm text-gray-700">Booking request created</p><p className="text-[11px] text-gray-400 mt-1">{format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}</p></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Status & Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Status</Label>
                <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Final Price</Label><div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input type="number" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder={request.estimated_price?.toString() || '0'} className="pl-8" /></div>{request.estimated_price && !finalPrice && <p className="text-xs text-gray-400">Estimated: ${request.estimated_price}</p>}</div>
              <div className="space-y-2"><Label>Internal Notes</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Private notes (not visible to customer)" rows={3} /></div>
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <div className="space-y-2">
                {status === 'new' && <Button className="w-full" variant="outline" onClick={() => { setStatus('contacted'); handleSave(); }}><Phone className="h-4 w-4 mr-2" />Mark as Contacted</Button>}
                {(status === 'contacted' || status === 'quoted') && <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMarkBooked}><CheckCircle className="h-4 w-4 mr-2" />Mark as Booked</Button>}
                {status === 'booked' && <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMarkCompleted}><CheckCircle className="h-4 w-4 mr-2" />Mark as Completed</Button>}
                {status !== 'cancelled' && status !== 'completed' && <Button className="w-full" variant="ghost" onClick={() => { setStatus('cancelled'); handleSave(); }}><XCircle className="h-4 w-4 mr-2" />Cancel Request</Button>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Quick Contact</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <a href={`tel:${request.customer_phone}`}><Button variant="outline" className="w-full justify-start"><Phone className="h-4 w-4 mr-2" />Call {firstName}</Button></a>
              <Button variant="outline" className="w-full justify-start" onClick={() => setShowQuickSms(true)}><MessageSquare className="h-4 w-4 mr-2" />Send SMS</Button>
              {request.customer_email && <a href={`mailto:${request.customer_email}`}><Button variant="outline" className="w-full justify-start"><Mail className="h-4 w-4 mr-2" />Send Email</Button></a>}
            </CardContent>
          </Card>

          {(request.final_price || request.estimated_price) && (
            <Card className={status === 'completed' ? 'border-emerald-200 bg-emerald-50/30' : ''}>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-gray-500 mb-1">{status === 'completed' ? 'Revenue Generated' : 'Potential Revenue'}</p>
                <p className={cn('text-3xl font-bold tracking-tight', status === 'completed' ? 'text-emerald-600' : 'text-gray-900')}>${request.final_price || request.estimated_price}</p>
                {request.source === 'campaign' && <p className="text-xs text-gray-400 mt-2">Attributed to campaign</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Quick SMS Modal */}
      <Dialog open={showQuickSms} onOpenChange={setShowQuickSms}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send SMS to {request.customer_name}</DialogTitle><DialogDescription>Send a quick message to {request.customer_phone}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Message</Label><Textarea value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} placeholder="Type your message..." rows={4} /><p className="text-xs text-gray-400 text-right">{smsMessage.length}/160</p></div>
            <div className="space-y-2"><Label className="text-xs text-gray-400">Quick Templates</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Follow Up', msg: `Hi ${firstName}! Thanks for your booking request. I wanted to confirm a few details. When works best to chat?` },
                  { label: 'Confirm Date', msg: `Hi ${firstName}! Great news - I have availability on your requested date. Ready to confirm your booking?` },
                  { label: 'Booking Confirmed', msg: `Hi ${firstName}! Your appointment is confirmed. See you soon!` },
                ].map(t => <Button key={t.label} variant="outline" size="sm" onClick={() => setSmsMessage(t.msg)}>{t.label}</Button>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickSms(false)}>Cancel</Button>
            <Button onClick={async () => { setIsSendingSms(true); await addActivity('sms_sent', smsMessage); setSmsMessage(''); setShowQuickSms(false); setIsSendingSms(false); toast({ title: 'SMS logged' }); if (status === 'new') setStatus('contacted'); }} disabled={isSendingSms || !smsMessage.trim()} variant="gradient">{isSendingSms ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Send SMS</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
