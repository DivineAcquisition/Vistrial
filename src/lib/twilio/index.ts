/**
 * Twilio Integration - Complete SMS send/receive implementation
 * 
 * @module @/lib/twilio
 */

// Client utilities
export {
  createTwilioClient,
  getTwilioClient,
  getUserTwilioClient,
} from "./client"

// Phone number formatting
export {
  formatPhoneE164,
  formatPhoneDisplay,
  isValidPhone,
  extractDigits,
} from "./format-phone"

// SMS sending
export { sendSMS, testTwilioConnection } from "./send-sms"
export type { SendSMSParams, SendSMSResult } from "./send-sms"

// Webhook validation
export {
  validateTwilioSignature,
  validateTwilioWebhook,
  parseTwilioWebhook,
  generateTwiMLResponse,
} from "./validate-webhook"

// Message templates
export {
  processTemplate,
  extractTemplateVariables,
  validateTemplateData,
  previewTemplate,
  MESSAGE_TEMPLATES,
} from "./template"
export type { TemplateData } from "./template"

// Opt-out handling
export {
  OPT_OUT_KEYWORDS,
  RESUBSCRIBE_KEYWORDS,
  HELP_KEYWORDS,
  detectKeyword,
  getKeywordResponse,
  getSpecificKeyword,
  detectSentiment,
  containsQuestion,
  detectBookingIntent,
} from "./opt-out"
export type { KeywordType } from "./opt-out"

// Timing utilities
export {
  canSendNow,
  getCurrentHour,
  getNextValidSendTime,
  isWeekend,
  getDayOfWeek,
  getNextWeekdaySendTime,
  formatTimeInTimezone,
  getDelayUntilCanSend,
  US_TIMEZONES,
  normalizeTimezone,
} from "./timing"
