// ============================================
// TELNYX EXPORTS
// ============================================

export {
  getTelnyxClient,
  formatToE164,
  isValidPhoneNumber,
  formatForDisplay,
  normalizePhone,
  sendSms,
  sendSmsWithRetry,
  sendBatchSms,
  initiateCall,
  getMessageStatus,
  listPhoneNumbers,
  detectMessageIntent,
  verifyWebhookSignature,
  processMessageTemplate,
  calculateSmsSegments,
  OPT_OUT_KEYWORDS,
  OPT_IN_KEYWORDS,
  HELP_KEYWORDS,
} from './client';

export type { SendSmsParams, SendSmsResult, BatchSmsParams, BatchSmsResult } from './client';
