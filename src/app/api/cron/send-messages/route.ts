// @ts-nocheck
/**
 * Send Messages Cron Job
 * Processes the message queue and sends pending SMS/voice messages
 * Run every 2 minutes via Vercel Cron
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronAuth(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const isVercelCron = request.headers.get('x-vercel-cron') === 'true';
  if (isVercelCron) {
    return true;
  }

  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${CRON_SECRET}`) {
      return true;
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return processMessageQueue();
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return processMessageQueue();
}

async function processMessageQueue() {
  const supabase = createAdminClient();

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Get pending messages from queue that are scheduled for now or earlier
    const { data: queuedMessages, error: fetchError } = await supabase
      .from('message_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .lt('attempts', 3) // Max 3 attempts
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Error fetching queue:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!queuedMessages || queuedMessages.length === 0) {
      return NextResponse.json({
        message: 'No pending messages',
        results,
      });
    }

    console.log(`Processing ${queuedMessages.length} queued messages`);

    for (const queueItem of queuedMessages) {
      results.processed++;

      try {
        // Mark as processing
        await supabase
          .from('message_queue')
          .update({
            status: 'processing',
            attempts: queueItem.attempts + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', queueItem.id);

        // Check if contact is still opted in
        const { data: contact } = await supabase
          .from('contacts')
          .select('sms_opted_in, voice_opted_in, status')
          .eq('id', queueItem.contact_id)
          .single();

        if (!contact || contact.status === 'unsubscribed') {
          await supabase
            .from('message_queue')
            .update({
              status: 'canceled',
              error_message: 'Contact unsubscribed',
            })
            .eq('id', queueItem.id);
          continue;
        }

        if (queueItem.type === 'sms' && !contact.sms_opted_in) {
          await supabase
            .from('message_queue')
            .update({
              status: 'canceled',
              error_message: 'SMS opted out',
            })
            .eq('id', queueItem.id);
          continue;
        }

        // Create message record
        const { data: message, error: messageError } = await supabase
          .from('messages')
          .insert({
            organization_id: queueItem.organization_id,
            contact_id: queueItem.contact_id,
            workflow_id: queueItem.workflow_id,
            enrollment_id: queueItem.enrollment_id,
            step_index: queueItem.step_index,
            type: queueItem.type,
            status: 'queued',
            to_address: queueItem.to_address,
            content: queueItem.content,
            audio_url: queueItem.audio_url,
          })
          .select()
          .single();

        if (messageError || !message) {
          throw new Error(messageError?.message || 'Failed to create message');
        }

        // TODO: Send via Telnyx API
        // For now, mark as sent (placeholder for actual Telnyx integration)
        await supabase
          .from('messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider: 'telnyx',
          })
          .eq('id', message.id);

        // Mark queue item as completed
        await supabase
          .from('message_queue')
          .update({
            status: 'completed',
            message_id: message.id,
            processed_at: new Date().toISOString(),
          })
          .eq('id', queueItem.id);

        // Update contact last_contacted_at
        await supabase
          .from('contacts')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', queueItem.contact_id);

        results.success++;
      } catch (error) {
        console.error(`Error processing queue item ${queueItem.id}:`, error);
        results.failed++;
        results.errors.push(
          `Queue ${queueItem.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        // Mark as failed if max attempts reached
        const newStatus =
          queueItem.attempts + 1 >= 3 ? 'failed' : 'pending';
        await supabase
          .from('message_queue')
          .update({
            status: newStatus,
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', queueItem.id);
      }
    }

    return NextResponse.json({
      message: `Processed ${results.processed} messages`,
      results,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
