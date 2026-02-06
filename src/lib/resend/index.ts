// ============================================
// RESEND EXPORTS
// ============================================

export {
  isResendConfigured,
  sendEmail,
  sendEmailWithRetry,
  sendTemplateEmail,
  sendBatchEmails,
  processEmailTemplate,
  wrapInBrandedTemplate,
  generateWorkflowEmailHtml,
  isValidEmail,
} from './client';

export type {
  SendEmailParams,
  SendEmailResult,
  SendTemplateEmailParams,
  BatchEmailParams,
  BatchEmailResult,
} from './client';
