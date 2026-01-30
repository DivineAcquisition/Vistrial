// ============================================
// VISTRIAL - SMS Message Templates
// Predefined templates for various notifications
// ============================================

export interface SMSTemplateData {
  businessName: string;
  customerName: string;
  date?: string;
  time?: string;
  address?: string;
  total?: number;
  deposit?: number;
  portalUrl?: string;
  quoteUrl?: string;
}

export const SMS_TEMPLATES = {
  // Booking confirmation
  bookingConfirmation: (data: SMSTemplateData) =>
    `✅ Confirmed! Your ${data.businessName} cleaning is scheduled for ${data.date} at ${data.time}. We'll text you a reminder the day before!`,

  // Booking reminder (day before)
  bookingReminder: (data: SMSTemplateData) =>
    `🔔 Reminder: Your ${data.businessName} cleaning is tomorrow, ${data.date} at ${data.time}. See you then!`,

  // Booking reminder (same day)
  bookingSameDay: (data: SMSTemplateData) =>
    `🏠 Hi ${data.customerName}! Just a reminder that your ${data.businessName} cleaning is today at ${data.time}. We're on our way!`,

  // Payment received
  paymentReceived: (data: SMSTemplateData) =>
    `💳 Payment of $${data.deposit} received for your ${data.businessName} cleaning on ${data.date}. Thank you!`,

  // Payment failed
  paymentFailed: (data: SMSTemplateData) =>
    `⚠️ Hi ${data.customerName}, your payment for ${data.businessName} couldn't be processed. Please update your payment method to keep your service active.`,

  // Membership welcome
  membershipWelcome: (data: SMSTemplateData) =>
    `🎉 Welcome to ${data.businessName}! Your recurring cleaning membership is now active. First cleaning: ${data.date}. Manage your account: ${data.portalUrl}`,

  // Membership renewal reminder
  membershipRenewal: (data: SMSTemplateData) =>
    `📅 Your ${data.businessName} cleaning is coming up on ${data.date}. We'll charge your card on file. Reply PAUSE to skip this cleaning.`,

  // Quote sent
  quoteSent: (data: SMSTemplateData) =>
    `Hi ${data.customerName}! Here's your ${data.businessName} quote for $${data.total}. View details & book instantly: ${data.quoteUrl}`,

  // Quote follow-up (Day 1)
  quoteFollowUp1: (data: SMSTemplateData) =>
    `Hi ${data.customerName}, just checking in! Did you have any questions about your ${data.businessName} quote? We'd love to help: ${data.quoteUrl}`,

  // Quote follow-up (Day 3)
  quoteFollowUp3: (data: SMSTemplateData) =>
    `${data.customerName}, your cleaning quote is still available! Book now to lock in your price of $${data.total}: ${data.quoteUrl}`,

  // Quote follow-up (Day 5 - urgency)
  quoteFollowUp5: (data: SMSTemplateData) =>
    `⏰ ${data.customerName}, spots are filling up! Your ${data.businessName} quote expires soon. Book now: ${data.quoteUrl}`,

  // Quote follow-up (Day 7 - final)
  quoteFollowUp7: (data: SMSTemplateData) =>
    `Last chance! Your ${data.businessName} quote for $${data.total} expires today. Book before it's gone: ${data.quoteUrl}`,

  // Review request
  reviewRequest: (data: SMSTemplateData) =>
    `Thank you for choosing ${data.businessName}! How was your cleaning? We'd love your feedback: [review_link]`,

  // Booking rescheduled
  bookingRescheduled: (data: SMSTemplateData) =>
    `📅 Your ${data.businessName} cleaning has been rescheduled to ${data.date} at ${data.time}. Questions? Just reply to this text!`,

  // Booking cancelled
  bookingCancelled: (data: SMSTemplateData) =>
    `Your ${data.businessName} cleaning on ${data.date} has been cancelled. We hope to see you again soon!`,

  // On the way
  onTheWay: (data: SMSTemplateData) =>
    `🚗 Your ${data.businessName} cleaner is on the way! ETA: ${data.time}. Address: ${data.address}`,

  // Job completed
  jobCompleted: (data: SMSTemplateData) =>
    `✨ All done! Your home is sparkling clean. Thanks for choosing ${data.businessName}! See you next time.`,
};

// Helper to format date
export function formatDateForSMS(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Helper to format time
export function formatTimeForSMS(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

// Get all available template names
export function getTemplateNames(): string[] {
  return Object.keys(SMS_TEMPLATES);
}
