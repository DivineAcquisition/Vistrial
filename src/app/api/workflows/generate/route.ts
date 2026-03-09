// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { goal, audience, tone, stepCount, channels } = body;

    if (!goal) {
      return NextResponse.json({ error: 'Workflow goal is required' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    const { data: fullOrg } = await admin
      .from('organizations')
      .select('name, business_type, phone, email, service_area, business_description, settings')
      .eq('id', org.id)
      .single();

    const businessContext = fullOrg ? {
      name: fullOrg.name,
      type: fullOrg.business_type,
      description: fullOrg.business_description,
      serviceArea: fullOrg.service_area,
      phone: fullOrg.phone,
    } : { name: org.name || 'Service Business' };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });

    const channelList = channels?.length > 0 ? channels.join(' and ') : 'SMS';

    const systemPrompt = `You are an expert at creating automated workflow sequences for service businesses. You generate specific, actionable message templates that businesses can send to their clients.

Business Context:
- Business Name: ${businessContext.name}
- Business Type: ${businessContext.type || 'service business'}
- Description: ${businessContext.description || 'A local service business'}
- Service Area: ${businessContext.serviceArea || 'Local area'}

Rules:
- Generate exactly ${stepCount || 5} workflow steps
- Use ${channelList} as the channel(s)
- Tone: ${tone || 'Professional'}
- Each SMS message must be under 160 characters
- Include merge fields: {{first_name}}, {{business_name}}
- SMS messages must end with "Reply STOP to opt out"
- Email messages should have a subject line
- Space steps with realistic delays (hours for first follow-up, then days)
- Make messages specific to the business type, not generic

Return ONLY a JSON array with this exact structure, no other text:
[
  {
    "type": "sms" or "email",
    "delay_value": number,
    "delay_unit": "hours" or "days",
    "message_template": "the message text",
    "email_subject": "subject line (only for email type)"
  }
]`;

    const userPrompt = `Create a ${stepCount || 5}-step automated ${channelList} workflow for this goal: "${goal}"${audience ? `\nTarget audience: ${audience}` : ''}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    let steps;
    try {
      const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');
      steps = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'AI returned invalid workflow' }, { status: 500 });
    }

    const workflowSteps = steps.map((step: any, index: number) => ({
      id: `gen-${index}`,
      type: step.type === 'email' ? 'email' : 'sms',
      delay_value: step.delay_value || (index === 0 ? 2 : index * 2),
      delay_unit: step.delay_unit || (index === 0 ? 'hours' : 'days'),
      template: step.message_template || step.template || '',
      email_subject: step.email_subject || '',
      email_body: step.type === 'email' ? (step.message_template || '') : '',
      is_active: true,
    }));

    return NextResponse.json({
      steps: workflowSteps,
      name: `${goal} Workflow`,
      description: `AI-generated ${channelList} workflow: ${goal}${audience ? ` targeting ${audience}` : ''}`,
    });
  } catch (error) {
    console.error('Workflow generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate workflow' },
      { status: 500 }
    );
  }
}
