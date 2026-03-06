// @ts-nocheck
// ============================================
// BOOKING WORKFLOW INTEGRATION
// Stop campaigns when bookings are created
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function stopCampaignsOnBooking({ contactId, organizationId, bookingRequestId, reason = 'Customer booked via booking page' }: { contactId: string; organizationId: string; bookingRequestId: string; reason?: string }) {
  const admin = getSupabaseAdminClient();
  try {
    const { data: active } = await admin.from('workflow_enrollments').select('id, workflow_id, workflows(name)').eq('contact_id', contactId).eq('organization_id', organizationId).eq('status', 'active');
    if (!active || active.length === 0) return { stopped: 0, enrollments: [] };

    await admin.from('workflow_enrollments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('contact_id', contactId).eq('organization_id', organizationId).eq('status', 'active');

    await admin.from('booking_request_activities').insert({ booking_request_id: bookingRequestId, organization_id: organizationId, type: 'campaigns_stopped', content: `${active.length} active campaign(s) stopped: ${active.map(e => e.workflows?.name || 'Unknown').join(', ')}` }).catch(() => {});

    return { stopped: active.length, enrollments: active.map(e => ({ id: e.id, workflowId: e.workflow_id, workflowName: e.workflows?.name })) };
  } catch (error) { console.error('Failed to stop campaigns:', error); return { stopped: 0, enrollments: [] }; }
}

export async function getBookingAttribution(contactId: string, organizationId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('workflow_enrollments').select('id, workflow_id, enrolled_at, workflows(id, name)').eq('contact_id', contactId).eq('organization_id', organizationId).in('status', ['active', 'completed']).order('enrolled_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { workflowId: data.workflow_id, workflowName: data.workflows?.name, enrollmentId: data.id };
}
