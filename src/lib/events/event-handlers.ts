// ============================================
// GLOBAL EVENT HANDLERS
// Register all cross-module event handlers
// ============================================

import { onEvent } from './event-bus';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

let isInitialized = false;

export function initializeEventHandlers() {
  if (isInitialized) return;
  isInitialized = true;

  const admin = getSupabaseAdminClient();

  // Track usage when message is sent
  onEvent('message.sent', async (payload: any) => {
    try {
      await admin
        .from('contacts')
        .update({ last_contacted: new Date().toISOString() })
        .eq('id', payload.contactId);
    } catch (error) {
      console.error('message.sent handler error:', error);
    }
  }, 100);

  // Handle incoming messages - mark enrollments as responded
  onEvent('message.received', async (payload: any) => {
    try {
      await admin
        .from('contacts')
        .update({ status: 'active', last_response: new Date().toISOString() })
        .eq('id', payload.contactId);

      const { data: enrollments } = await admin
        .from('workflow_enrollments')
        .select('id, workflow_id')
        .eq('contact_id', payload.contactId)
        .eq('organization_id', payload.organizationId)
        .eq('status', 'active');

      if (enrollments && enrollments.length > 0) {
        for (const enrollment of enrollments) {
          await admin
            .from('workflow_enrollments')
            .update({ status: 'responded', responded_at: new Date().toISOString() })
            .eq('id', enrollment.id);
        }
      }
    } catch (error) {
      console.error('message.received handler error:', error);
    }
  }, 100);

  // Stop workflows on unsubscribe
  onEvent('contact.status_changed', async (payload: any) => {
    try {
      if (payload.newStatus === 'unsubscribed' || payload.newStatus === 'do_not_contact') {
        await admin
          .from('workflow_enrollments')
          .update({
            status: 'stopped',
            stopped_at: new Date().toISOString(),
            stop_reason: `Contact status changed to ${payload.newStatus}`,
          })
          .eq('contact_id', payload.contactId)
          .eq('organization_id', payload.organizationId)
          .eq('status', 'active');
      }
    } catch (error) {
      console.error('contact.status_changed handler error:', error);
    }
  }, 100);

  console.log('Event handlers initialized');
}
