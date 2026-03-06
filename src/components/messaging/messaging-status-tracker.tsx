'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle, XCircle, MessageSquare, Phone, Shield, Zap, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Step { id: string; label: string; description: string; status: 'complete' | 'active' | 'pending' | 'failed'; }

export function MessagingStatusTracker({ registration: initial }: { registration: any }) {
  const [reg, setReg] = useState(initial);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Poll for updates every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/messaging/a2p/status');
        if (res.ok) { const data = await res.json(); if (data.registration) setReg(data.registration); }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/messaging/a2p/status');
      if (res.ok) { const data = await res.json(); if (data.registration) setReg(data.registration); }
    } catch {}
    finally { setIsRefreshing(false); }
  };

  const steps: Step[] = [
    {
      id: 'submitted', label: 'Business Info Submitted', description: 'Your business details have been submitted for verification',
      status: 'complete',
    },
    {
      id: 'brand', label: 'Brand Verification', description: 'TCR is verifying your business identity (1-3 days)',
      status: reg.brand_status === 'verified' ? 'complete' : reg.brand_status === 'failed' ? 'failed' : 'active',
    },
    {
      id: 'campaign', label: 'Campaign Approval', description: 'Carriers are reviewing your messaging use case (1-5 days)',
      status: reg.campaign_status === 'approved' ? 'complete' : reg.campaign_status === 'declined' ? 'failed' : reg.campaign_status === 'pending' ? 'active' : 'pending',
    },
    {
      id: 'number', label: 'Number Assigned', description: 'A local phone number is being assigned to your account',
      status: reg.number_status === 'active' ? 'complete' : reg.number_status === 'failed' ? 'failed' : 'pending',
    },
    {
      id: 'active', label: 'Messaging Active', description: 'Your SMS campaigns are ready to send',
      status: reg.overall_status === 'active' ? 'complete' : 'pending',
    },
  ];

  const getIcon = (status: string) => {
    if (status === 'complete') return <CheckCircle className="h-5 w-5 text-emerald-600" />;
    if (status === 'active') return <Clock className="h-5 w-5 text-brand-600 animate-pulse-soft" />;
    if (status === 'failed') return <XCircle className="h-5 w-5 text-red-500" />;
    return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
  };

  return (
    <div className="space-y-6">
      {/* Overall status banner */}
      {reg.overall_status === 'active' ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Zap className="h-5 w-5 text-emerald-600" /></div>
          <div className="flex-1"><p className="font-semibold text-emerald-900">Messaging is Active!</p><p className="text-xs text-emerald-700">Sending from {reg.telnyx_phone_number}</p></div>
          <Badge variant="success">Active</Badge>
        </div>
      ) : reg.overall_status === 'failed' ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1"><p className="font-semibold text-red-900">Setup Failed</p><p className="text-xs text-red-700">{reg.failure_reason || 'Please contact support for assistance.'}</p></div>
          <Link href="/messaging/setup"><Button size="sm" variant="outline">Retry</Button></Link>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-brand-50 rounded-2xl border border-brand-100">
          <Clock className="h-5 w-5 text-brand-600 animate-pulse-soft shrink-0" />
          <div className="flex-1"><p className="font-semibold text-brand-900">Setup In Progress</p><p className="text-xs text-brand-700">Your messaging setup is being processed. This is fully automated.</p></div>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isRefreshing}><RefreshCw className={cn("h-3.5 w-3.5 mr-1", isRefreshing && "animate-spin")} />Refresh</Button>
        </div>
      )}

      {/* Step tracker */}
      <Card>
        <CardHeader><CardTitle className="text-base">Setup Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={step.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={cn('flex items-center justify-center rounded-full', step.status === 'complete' ? 'bg-emerald-50' : step.status === 'active' ? 'bg-brand-50' : step.status === 'failed' ? 'bg-red-50' : 'bg-gray-50')}>
                    {getIcon(step.status)}
                  </div>
                  {i < steps.length - 1 && <div className={cn('w-px flex-1 my-1', step.status === 'complete' ? 'bg-emerald-200' : 'bg-gray-200')} style={{ minHeight: '24px' }} />}
                </div>
                <div className="pb-6 flex-1">
                  <p className={cn('text-sm font-medium', step.status === 'failed' ? 'text-red-700' : step.status === 'complete' ? 'text-gray-900' : step.status === 'active' ? 'text-brand-700' : 'text-gray-400')}>{step.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  {step.id === 'brand' && reg.brand_verified_at && <p className="text-[11px] text-emerald-600 mt-1">Verified {new Date(reg.brand_verified_at).toLocaleDateString()}</p>}
                  {step.id === 'campaign' && reg.campaign_approved_at && <p className="text-[11px] text-emerald-600 mt-1">Approved {new Date(reg.campaign_approved_at).toLocaleDateString()}</p>}
                  {step.id === 'active' && reg.activated_at && <p className="text-[11px] text-emerald-600 mt-1">Activated {new Date(reg.activated_at).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Registration details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Registration Details</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Business</span><span className="font-medium">{reg.legal_business_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">EIN</span><span className="font-mono">{reg.ein}</span></div>
          {reg.telnyx_phone_number && <div className="flex justify-between"><span className="text-gray-500">SMS Number</span><span className="font-mono font-medium text-emerald-600">{reg.telnyx_phone_number}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Submitted</span><span>{new Date(reg.created_at).toLocaleDateString()}</span></div>
        </CardContent>
      </Card>

      {reg.overall_status === 'active' && (
        <div className="text-center"><Link href="/workflows/new"><Button variant="gradient" size="lg"><MessageSquare className="h-4 w-4 mr-2" />Create Your First Campaign<ArrowRight className="h-4 w-4 ml-2" /></Button></Link></div>
      )}
    </div>
  );
}
