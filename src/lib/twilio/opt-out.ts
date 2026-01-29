/**
 * Twilio Opt-Out Keyword Handling
 * 
 * TCPA compliance requires honoring these keywords immediately
 */

// Opt-out keywords that must be honored (TCPA requirement)
export const OPT_OUT_KEYWORDS = [
  "STOP",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "STOPALL",
] as const

// Resubscribe keywords to allow users to opt back in
export const RESUBSCRIBE_KEYWORDS = [
  "START",
  "UNSTOP",
  "SUBSCRIBE",
  "YES",
] as const

// Help keywords for user assistance
export const HELP_KEYWORDS = ["HELP", "INFO"] as const

export type KeywordType = "opt_out" | "resubscribe" | "help" | "normal"

/**
 * Detect if message contains a keyword command
 */
export function detectKeyword(message: string): KeywordType {
  const normalized = message.trim().toUpperCase()

  if (OPT_OUT_KEYWORDS.includes(normalized as any)) {
    return "opt_out"
  }

  if (RESUBSCRIBE_KEYWORDS.includes(normalized as any)) {
    return "resubscribe"
  }

  if (HELP_KEYWORDS.includes(normalized as any)) {
    return "help"
  }

  return "normal"
}

/**
 * Get the appropriate auto-response for a keyword
 */
export function getKeywordResponse(
  type: KeywordType,
  businessName: string,
  businessPhone?: string
): string | null {
  switch (type) {
    case "opt_out":
      return `You have been unsubscribed from ${businessName} texts. You will receive no further messages. Reply START to resubscribe.`

    case "resubscribe":
      return `You have been resubscribed to ${businessName} texts. Reply STOP at any time to opt out.`

    case "help":
      const phoneInfo = businessPhone ? ` Call ${businessPhone} for assistance.` : ""
      return `${businessName}: Reply STOP to unsubscribe from texts.${phoneInfo} Msg frequency varies. Msg & data rates may apply.`

    default:
      return null
  }
}

/**
 * Check if a specific keyword was used
 */
export function getSpecificKeyword(
  message: string
): (typeof OPT_OUT_KEYWORDS)[number] | (typeof RESUBSCRIBE_KEYWORDS)[number] | null {
  const normalized = message.trim().toUpperCase()

  if (OPT_OUT_KEYWORDS.includes(normalized as any)) {
    return normalized as (typeof OPT_OUT_KEYWORDS)[number]
  }

  if (RESUBSCRIBE_KEYWORDS.includes(normalized as any)) {
    return normalized as (typeof RESUBSCRIBE_KEYWORDS)[number]
  }

  return null
}

/**
 * Simple sentiment detection for lead responses
 */
export function detectSentiment(
  text: string
): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase()

  const positiveWords = [
    "yes",
    "interested",
    "sounds good",
    "call me",
    "schedule",
    "book",
    "okay",
    "ok",
    "sure",
    "great",
    "perfect",
    "thanks",
    "thank you",
    "awesome",
    "definitely",
    "absolutely",
    "let's do it",
    "when can you",
    "available",
  ]

  const negativeWords = [
    "no",
    "not interested",
    "stop",
    "remove",
    "don't",
    "dont",
    "cant",
    "can't",
    "cannot",
    "busy",
    "later",
    "maybe later",
    "not now",
    "no thanks",
    "pass",
    "decline",
    "too expensive",
    "too much",
    "found someone",
    "went with",
    "already",
  ]

  const hasPositive = positiveWords.some((word) => lower.includes(word))
  const hasNegative = negativeWords.some((word) => lower.includes(word))

  if (hasPositive && !hasNegative) return "positive"
  if (hasNegative && !hasPositive) return "negative"
  return "neutral"
}

/**
 * Check if message contains a question
 */
export function containsQuestion(text: string): boolean {
  return (
    text.includes("?") ||
    /\b(how|what|when|where|why|who|which|can you|do you|are you|is it|will you)\b/i.test(
      text
    )
  )
}

/**
 * Detect if message indicates intent to book
 */
export function detectBookingIntent(text: string): boolean {
  const lower = text.toLowerCase()
  const bookingPhrases = [
    "schedule",
    "book",
    "appointment",
    "when can you",
    "available",
    "set up",
    "let's do it",
    "i'm ready",
    "im ready",
    "go ahead",
    "proceed",
    "yes please",
    "sounds good",
    "let's go",
  ]

  return bookingPhrases.some((phrase) => lower.includes(phrase))
}
