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

// Number lookup / phone validation
export {
  lookupNumber,
  lookupNumbers,
  canReceiveSMS,
  estimateLookupCost,
  formatToE164 as formatToE164Lookup,
} from './number-lookup';

export type { NumberLookupResult, BulkValidationResult } from './number-lookup';
