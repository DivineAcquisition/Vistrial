// ============================================
// TRANSACTIONAL EMAIL SENDERS
// Helper functions for sending specific emails
// ============================================

import { render } from '@react-email/components';
import { sendEmail } from './client';
import { WelcomeEmail } from './templates/welcome';
import { PasswordResetEmail } from './templates/password-reset';
import { NewResponseEmail } from './templates/new-response';
import { WeeklyDigestEmail } from './templates/weekly-digest';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.com';

// Send welcome email
export async function sendWelcomeEmail(params: {
  to: string;
  firstName: string;
}) {
  const html = await render(
    WelcomeEmail({
      firstName: params.firstName,
      loginUrl: `${APP_URL}/dashboard`,
    })
  );

  return sendEmail({
    to: params.to,
    subject: `Welcome to Vistrial, ${params.firstName}! 🎉`,
    html,
    tags: [{ name: 'type', value: 'welcome' }],
  });
}

// Send password reset email
export async function sendPasswordResetEmail(params: {
  to: string;
  firstName: string;
  token: string;
}) {
  const html = await render(
    PasswordResetEmail({
      firstName: params.firstName,
      resetUrl: `${APP_URL}/reset-password?token=${params.token}`,
    })
  );

  return sendEmail({
    to: params.to,
    subject: 'Reset your Vistrial password',
    html,
    tags: [{ name: 'type', value: 'password-reset' }],
  });
}

// Send new response notification
export async function sendNewResponseEmail(params: {
  to: string;
  firstName: string;
  contactName: string;
  contactPhone: string;
  message: string;
  workflowName: string;
  conversationId: string;
}) {
  const html = await render(
    NewResponseEmail({
      firstName: params.firstName,
      contactName: params.contactName,
      contactPhone: params.contactPhone,
      message: params.message,
      workflowName: params.workflowName,
      inboxUrl: `${APP_URL}/inbox?conversation=${params.conversationId}`,
    })
  );

  return sendEmail({
    to: params.to,
    subject: `🔔 New response from ${params.contactName}`,
    html,
    tags: [{ name: 'type', value: 'response-notification' }],
  });
}

// Send weekly digest
export async function sendWeeklyDigestEmail(params: {
  to: string;
  firstName: string;
  weekOf: string;
  stats: {
    messagesSent: number;
    responses: number;
    responseRate: number;
    bookings: number;
    revenue: number;
  };
  topWorkflow: { name: string; responses: number } | null;
}) {
  const html = await render(
    WeeklyDigestEmail({
      firstName: params.firstName,
      weekOf: params.weekOf,
      stats: params.stats,
      topWorkflow: params.topWorkflow,
      dashboardUrl: `${APP_URL}/analytics`,
    })
  );

  return sendEmail({
    to: params.to,
    subject: `📊 Your Vistrial weekly report - ${params.weekOf}`,
    html,
    tags: [{ name: 'type', value: 'weekly-digest' }],
  });
}
