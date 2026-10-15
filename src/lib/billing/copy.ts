/**
 * Customer email drafts. Marked for review before they are treated as final terms.
 * No card numbers. No other company. Limits reset in America/New_York.
 *
 * REVIEW: counsel should read anything that describes what happens to data.
 */

export const BILLING_EMAILS = {
  payment_method_needed: {
    review: true,
    subject: "Add a payment method for Vistrial",
    body: "Your workspace is ready for a payment method. Open Billing and add one before the first charge. Nothing is charged until go-live, unless your team set a different date.",
  },
  payment_failed: {
    review: true,
    subject: "A payment to Vistrial did not go through",
    body: "The last payment did not go through. Everything keeps working for now. Open Billing to update the payment method.",
  },
  grace_reminder: {
    review: true,
    subject: "Vistrial still needs a working payment method",
    body: "The last payment has not gone through yet. Update it in Billing. Your workspace keeps working during this time.",
  },
  restricted: {
    review: true,
    subject: "Some Vistrial automation is paused",
    body: "The payment is still outstanding, so new drafts, new AI case files, Compass, and new transcription are paused. You can still sign in, read your leads, and update the payment method. Paying restores them. Nothing already saved is deleted.",
  },
  suspended: {
    review: true,
    subject: "Your Vistrial workspace is paused",
    body: "The workspace is paused because the payment is still outstanding. You can still pay, download your data, or cancel. Your records stay until the usual retention period.",
  },
  restored: {
    review: true,
    subject: "Vistrial is back",
    body: "The payment went through. Scribe and Sentry resume first. Relay starts fresh, with no old drafts sent. Compass follows a few minutes later.",
  },
  usage_80: {
    review: true,
    subject: "You are near a Vistrial limit",
    body: "One of your included amounts is at 80 percent. Open Billing to see which one, and when it resets. Ask your team if you need more.",
  },
  usage_100: {
    review: true,
    subject: "A Vistrial limit has been reached",
    body: "An included amount is used up for this period. New leads are still saved with a basic case file. The full case file waits until the reset, or until your plan changes. Open Billing for the reset date.",
  },
  cancel_scheduled: {
    review: true,
    subject: "Your Vistrial plan will end",
    body: "Cancellation is scheduled for the end of the paid period. You can export your data before then. Nothing is deleted by canceling.",
  },
  pilot_ending: {
    review: true,
    subject: "A Vistrial pilot is ending",
    body: "This pilot has an end date coming up. Convert it to a paid plan or it stops being complimentary.",
  },
} as const;

export const MEMBER_LIMIT_MESSAGE = "Your team has reached its limit for this. Ask your Owner.";
