// ============================================
// RESEND CLIENT
// Email sending integration via Resend
// Domains: vistrial.io & mail.vistrial.io
// ============================================

import { Resend } from 'resend';

// ============================================
// CONFIGURATION
// ============================================

let resendInstance: Resend | null = null;

function getResendClient(): Resend {
  if (resendInstance) return resendInstance;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Add it to your environment variables.'
    );
  }

  resendInstance = new Resend(apiKey);
  return resendInstance;
}

/**
 * Check if Resend is configured
 */
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// ============================================
// EMAIL CONFIGURATION
// ============================================

/** Default from address using the mail subdomain */
const DEFAULT_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'Vistrial <noreply@mail.vistrial.io>';

/** Reply-to address on the main domain */
const DEFAULT_REPLY_TO =
  process.env.RESEND_REPLY_TO || 'support@vistrial.io';

// ============================================
// TYPES
// ============================================

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  tags?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendTemplateEmailParams {
  to: string | string[];
  subject: string;
  template: string;
  variables: Record<string, string | undefined>;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

// ============================================
// EMAIL SENDING
// ============================================

/**
 * Send an email via Resend
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  try {
    const resend = getResendClient();

    // Ensure we have either html or text content
    if (!params.html && !params.text) {
      return {
        success: false,
        error: 'Email must have either html or text content',
      };
    }

    const { data, error } = await resend.emails.send({
      from: params.from || DEFAULT_FROM_EMAIL,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo || DEFAULT_REPLY_TO,
      cc: params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : undefined,
      bcc: params.bcc
        ? Array.isArray(params.bcc)
          ? params.bcc
          : [params.bcc]
        : undefined,
      tags: params.tags,
      headers: params.headers,
    });

    if (error) {
      console.error('Resend email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error('Email send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Send an email with retry logic
 */
export async function sendEmailWithRetry(
  params: SendEmailParams,
  maxRetries: number = 3
): Promise<SendEmailResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendEmail(params);

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Don't retry for certain errors (validation, auth, etc.)
    if (
      lastError?.includes('validation') ||
      lastError?.includes('Invalid') ||
      lastError?.includes('unauthorized') ||
      lastError?.includes('API key')
    ) {
      return result;
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt))
      );
    }
  }

  return {
    success: false,
    error: lastError || 'Max retries exceeded',
  };
}

// ============================================
// TEMPLATE PROCESSING
// ============================================

/**
 * Process template variables in email content
 * Replaces {{variable_name}} patterns with values
 */
export function processEmailTemplate(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let processed = template;

  const variablePattern = /\{\{(\w+)\}\}/g;
  processed = processed.replace(variablePattern, (match, variableName) => {
    const value = variables[variableName];
    return value !== undefined ? value : match;
  });

  return processed;
}

/**
 * Send a templated email with variable replacement
 */
export async function sendTemplateEmail(
  params: SendTemplateEmailParams
): Promise<SendEmailResult> {
  const processedSubject = processEmailTemplate(
    params.subject,
    params.variables
  );
  const processedHtml = processEmailTemplate(
    params.template,
    params.variables
  );
  // Generate a plain text version by stripping HTML tags
  const processedText = processedHtml.replace(/<[^>]*>/g, '');

  return sendEmail({
    to: params.to,
    subject: processedSubject,
    html: processedHtml,
    text: processedText,
    from: params.from,
    replyTo: params.replyTo,
    tags: params.tags,
  });
}

// ============================================
// BATCH SENDING
// ============================================

export interface BatchEmailParams {
  emails: Array<{
    to: string;
    subject: string;
    html?: string;
    text?: string;
    tags?: Array<{ name: string; value: string }>;
  }>;
  from?: string;
  replyTo?: string;
  delayBetweenMs?: number;
}

export interface BatchEmailResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    to: string;
    result: SendEmailResult;
  }>;
}

/**
 * Send batch emails with rate limiting
 */
export async function sendBatchEmails(
  params: BatchEmailParams
): Promise<BatchEmailResult> {
  const results: BatchEmailResult['results'] = [];
  const delayMs = params.delayBetweenMs || 50; // Default 50ms between emails

  for (const email of params.emails) {
    const result = await sendEmail({
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      from: params.from,
      replyTo: params.replyTo,
      tags: email.tags,
    });

    results.push({
      to: email.to,
      result,
    });

    // Rate limiting delay
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: params.emails.length,
    successful: results.filter((r) => r.result.success).length,
    failed: results.filter((r) => !r.result.success).length,
    results,
  };
}

// ============================================
// BRANDED EMAIL TEMPLATES
// ============================================

/**
 * Wrap content in the Vistrial branded email layout
 */
export function wrapInBrandedTemplate(
  content: string,
  options?: {
    businessName?: string;
    businessColor?: string;
    preheader?: string;
    footerText?: string;
  }
): string {
  const brandColor = options?.businessColor || '#8b5cf6';
  const businessName = options?.businessName || 'Vistrial';
  const preheader = options?.preheader || '';
  const footerText =
    options?.footerText ||
    `Sent via Vistrial · <a href="https://vistrial.io" style="color: ${brandColor};">vistrial.io</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${businessName}</title>
  <!--[if !mso]><!-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  </style>
  <!--<![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: #f9fafb; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { width: 100%; background-color: #f9fafb; padding: 40px 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { padding: 32px 40px 24px; border-bottom: 1px solid #f3f4f6; }
    .header-logo { font-size: 20px; font-weight: 700; color: ${brandColor}; text-decoration: none; }
    .content { padding: 32px 40px; color: #374151; font-size: 15px; line-height: 1.7; }
    .content h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 16px; }
    .content h2 { font-size: 18px; font-weight: 600; color: #111827; margin: 24px 0 12px; }
    .content p { margin: 0 0 16px; }
    .content a { color: ${brandColor}; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, ${brandColor}, ${adjustColor(brandColor, -20)}); color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
    .footer { padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center; font-size: 12px; color: #9ca3af; line-height: 1.6; }
    .footer a { color: #6b7280; text-decoration: underline; }
    .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; max-height: 0; max-width: 0; overflow: hidden; }
    @media only screen and (max-width: 620px) {
      .container { margin: 0 16px; }
      .header, .content, .footer { padding-left: 24px; padding-right: 24px; }
    }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <a href="https://vistrial.io" class="header-logo">${businessName}</a>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        ${footerText}
        <br>
        <a href="{{unsubscribe_url}}">Unsubscribe</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Adjust a hex color by a given amount (darken if negative)
 */
function adjustColor(hex: string, amount: number): string {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ============================================
// WORKFLOW EMAIL TEMPLATES
// ============================================

/**
 * Generate workflow step email HTML from a text template
 * Converts plain text template to branded HTML email
 */
export function generateWorkflowEmailHtml(
  textTemplate: string,
  options?: {
    businessName?: string;
    businessColor?: string;
    ctaText?: string;
    ctaUrl?: string;
  }
): string {
  // Convert line breaks to paragraphs
  const paragraphs = textTemplate
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${line}</p>`)
    .join('');

  let content = paragraphs;

  // Add CTA button if provided
  if (options?.ctaText && options?.ctaUrl) {
    content += `<p style="text-align: center; margin-top: 24px;">
      <a href="${options.ctaUrl}" class="btn">${options.ctaText}</a>
    </p>`;
  }

  return wrapInBrandedTemplate(content, {
    businessName: options?.businessName,
    businessColor: options?.businessColor,
  });
}

// ============================================
// VALIDATE EMAIL
// ============================================

/**
 * Basic email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return emailRegex.test(email.trim());
}
