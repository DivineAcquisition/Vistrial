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

// New SMS sending service (class-based client)
export { sendSMS, sendBulkSMS, formatE164 } from './send-sms';
export type { SendSMSParams, SendSMSResult } from './send-sms';

// Phone number management
export { searchAvailableNumbers, purchaseNumber, configureNumber, getOwnedNumbers } from './numbers';
export type { AvailableNumber, PurchasedNumber } from './numbers';

// Webhook handlers
export { handleInboundMessage, handleDeliveryStatus } from './webhook-handlers';
