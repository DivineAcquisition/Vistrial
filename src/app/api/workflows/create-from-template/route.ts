// @ts-nocheck
// ============================================
// CREATE WORKFLOW FROM TEMPLATE API
// Creates a workflow from a pre-built template
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const TEMPLATES = {
  'we-miss-you': {
    name: 'We Miss You',
    description: 'Reactivation campaign for dormant customers',
    category: 'reactivation',
    steps: [
      {
        type: 'sms',
        delay_days: 0,
        delay_hours: 0,
        template:
          "Hey {{first_name}}! It's been a while since your last visit with {{business_name}}. We'd love to have you back! Reply YES if you'd like to schedule.",
      },
      {
        type: 'sms',
        delay_days: 3,
        delay_hours: 0,
        template:
          "Hi {{first_name}}, just following up - are you ready to book your next appointment with us?",
      },
      {
        type: 'sms',
        delay_days: 7,
        delay_hours: 0,
        template:
          "Last chance, {{first_name}}! We're offering 10% off your next service. Interested? Reply YES!",
      },
    ],
  },
  'seasonal-reminder': {
    name: 'Seasonal Reminder',
    description: 'Regular maintenance reminder campaign',
    category: 'reactivation',
    steps: [
      {
        type: 'sms',
        delay_days: 0,
        delay_hours: 0,
        template:
          "Hi {{first_name}}! It's that time again - ready to schedule your regular service with {{business_name}}? Reply to book!",
      },
      {
        type: 'sms',
        delay_days: 4,
        delay_hours: 0,
        template:
          "{{first_name}}, don't forget about your regular maintenance! We've got openings this week. Interested?",
      },
      {
        type: 'sms',
        delay_days: 7,
        delay_hours: 0,
        template:
          "Final reminder: Let's get you on the schedule, {{first_name}}. Reply YES to book your service!",
      },
    ],
  },
  'review-request': {
    name: 'Review Request',
    description: 'Ask happy customers for reviews',
    category: 'review',
    steps: [
      {
        type: 'sms',
        delay_days: 0,
        delay_hours: 0,
        template:
          "Hi {{first_name}}! Thank you for choosing {{business_name}}. If you were happy with our service, we'd really appreciate a quick review: {{review_link}}",
      },
      {
        type: 'sms',
        delay_days: 3,
        delay_hours: 0,
        template:
          "{{first_name}}, your feedback helps us grow! Would you mind leaving a quick review? It only takes 30 seconds: {{review_link}}",
      },
    ],
  },
};

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, customizations, enrollAll } = body;

    const template = TEMPLATES[templateId];
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const admin = getSupabaseAdminClient();

    // Store customizations for template variable substitution
    const templateVariables = {
      business_name: customizations?.businessName || context.organization.name,
      booking_link: customizations?.bookingLink || '',
      review_link: customizations?.reviewLink || '',
    };

    // Create workflow
    const { data: workflow, error: workflowError } = await admin
      .from('workflows')
      .insert({
        organization_id: context.organization.id,
        name: template.name,
        description: template.description,
        category: template.category,
        status: 'active',
        steps: template.steps,
        settings: {
          send_window_start: '09:00',
          send_window_end: '20:00',
          send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          respect_timezone: true,
          stop_on_response: true,
          stop_on_booking: false,
          template_variables: templateVariables,
        },
        enrollment_criteria: {
          status: ['active', 'inactive'],
          has_phone: true,
        },
      })
      .select()
      .single();

    if (workflowError) {
      console.error('Workflow creation error:', workflowError);
      throw workflowError;
    }

    // If enrollAll, enroll all contacts
    if (enrollAll && workflow) {
      // Get all contacts with phone numbers
      const { data: contacts } = await admin
        .from('contacts')
        .select('id')
        .eq('organization_id', context.organization.id)
        .not('phone', 'is', null)
        .neq('status', 'unsubscribed')
        .limit(250); // Lite plan limit

      if (contacts && contacts.length > 0) {
        // Create enrollments
        const enrollments = contacts.map((contact) => ({
          workflow_id: workflow.id,
          contact_id: contact.id,
          status: 'active',
          current_step: 0,
          enrolled_at: new Date().toISOString(),
        }));

        await admin.from('workflow_enrollments').insert(enrollments);
      }
    }

    return NextResponse.json({
      workflow,
      enrolled: enrollAll ? 'all' : 'none',
    });
  } catch (error) {
    console.error('Create workflow from template error:', error);
    return NextResponse.json(
      { error: 'Failed to create workflow' },
      { status: 500 }
    );
  }
}
