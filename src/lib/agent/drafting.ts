// @ts-nocheck
// ============================================
// AGENT DRAFTING SYSTEM
// Claude API-powered message drafting
// ============================================

interface DraftContext {
  clientName: string;
  contactName: string;
  healthScore: number;
  warningLevel: string;
  daysSinceContact: number;
  recentSentiment: string | null;
  overdueDeliverables: string[];
  renewalDays: number | null;
  businessName: string;
  teamMemberName: string;
  communicationStyle: string;
  draftType: 'check_in' | 'retention_save' | 'renewal' | 'celebration' | 'follow_up' | 'escalation';
}

const SYSTEM_PROMPT = `You are a client success AI assistant for a service business. You draft professional, empathetic messages to clients on behalf of account managers.

Rules:
- Match the communication style specified (formal, casual, direct, warm)
- Be genuine, not robotic — these are real business relationships
- If health is low, acknowledge issues without being alarmist
- Keep messages concise (under 150 words for emails, under 160 chars for SMS)
- Include a clear next step or question
- Never mention health scores, AI, or automated systems to the client
- Sign off with the team member's name`;

export async function generateDraft(context: DraftContext): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { subject: 'Check-in', body: `Hi ${context.contactName}, just checking in. How are things going?` };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const prompt = buildPrompt(context);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    const subjectMatch = text.match(/Subject:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);

    return {
      subject: subjectMatch?.[1]?.trim() || 'Check-in',
      body: bodyMatch?.[1]?.trim() || text.trim(),
    };
  } catch (error) {
    console.error('Draft generation error:', error);
    return { subject: 'Check-in', body: `Hi ${context.contactName}, just checking in. How are things going on your end? Let me know if you need anything.` };
  }
}

function buildPrompt(ctx: DraftContext): string {
  const parts = [
    `Draft a ${ctx.draftType.replace('_', ' ')} email from ${ctx.teamMemberName} at ${ctx.businessName} to ${ctx.contactName} at ${ctx.clientName}.`,
    `Communication style: ${ctx.communicationStyle}.`,
    `Health context: Score ${ctx.healthScore}/100, warning level: ${ctx.warningLevel}, ${ctx.daysSinceContact} days since last contact.`,
  ];

  if (ctx.recentSentiment) parts.push(`Recent sentiment: ${ctx.recentSentiment}.`);
  if (ctx.overdueDeliverables.length > 0) parts.push(`Overdue deliverables: ${ctx.overdueDeliverables.join(', ')}.`);
  if (ctx.renewalDays !== null && ctx.renewalDays < 60) parts.push(`Contract renews in ${ctx.renewalDays} days.`);

  parts.push('Format your response as:\nSubject: [subject line]\nBody: [email body]');

  return parts.join('\n');
}

export async function analyzeSentiment(text: string): Promise<{ sentiment: string; confidence: number; keyPhrases: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { sentiment: 'neutral', confidence: 50, keyPhrases: [] };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: 'Analyze the sentiment of this client message. Return JSON only: {"sentiment": "enthusiastic|positive|neutral|confused|disappointed|frustrated|angry", "confidence": 0-100, "keyPhrases": ["phrase1", "phrase2"]}',
      messages: [{ role: 'user', content: text }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Sentiment analysis error:', error);
  }
  return { sentiment: 'neutral', confidence: 50, keyPhrases: [] };
}
