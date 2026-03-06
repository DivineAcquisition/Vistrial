// @ts-nocheck
// ============================================
// TELNYX A2P 10DLC SERVICE
// Brand registration, campaign creation, number management
// ============================================

const TELNYX_API = 'https://api.telnyx.com';

function getHeaders() {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error('TELNYX_API_KEY not configured');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
}

async function telnyxRequest(method: string, path: string, body?: any) {
  const url = `${TELNYX_API}${path}`;
  const res = await fetch(url, { method, headers: getHeaders(), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Telnyx API error [${method} ${path}]:`, data);
    throw new Error(data?.errors?.[0]?.detail || data?.error?.message || `Telnyx API error: ${res.status}`);
  }
  return data;
}

// ============================================
// BRAND REGISTRATION
// ============================================

interface BrandData {
  displayName: string;
  companyName: string;
  ein: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export async function createBrand(data: BrandData): Promise<{ brandId: string }> {
  const result = await telnyxRequest('POST', '/10dlc/brand', {
    entityType: 'PRIVATE_PROFIT',
    displayName: data.displayName,
    companyName: data.companyName,
    ein: data.ein.replace(/\D/g, ''),
    phone: data.phone,
    street: data.street,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
    country: 'US',
    vertical: 'CLEANING',
    businessContactEmail: data.email,
  });
  return { brandId: result.data?.brandId || result.brandId || result.data?.id };
}

// ============================================
// CAMPAIGN REGISTRATION
// ============================================

interface CampaignData {
  brandId: string;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
}

export async function createCampaign(data: CampaignData): Promise<{ campaignId: string }> {
  const result = await telnyxRequest('POST', '/v2/10dlc/campaignBuilder', {
    brandId: data.brandId,
    usecase: 'CUSTOMER_CARE',
    subUsecases: ['CUSTOMER_CARE', 'MARKETING'],
    description: `Post-service follow-up messages and recurring service offers for residential cleaning clients of ${data.businessName}`,
    messageFlow: `Customers opt in to receive messages when they book a service through our website or phone. They provide their phone number during booking and agree to receive service-related communications including appointment confirmations, service follow-ups, and special offers. Customers can opt out at any time by replying STOP.`,
    sample1: `Hi {name}, thanks for choosing ${data.businessName}! How was your service today? We'd love your feedback. Reply STOP to opt out.`,
    sample2: `Hi {name}, it's been a while since your last service! Ready for your next one? Lock in recurring service and save. Reply STOP to opt out.`,
    sample3: `Hi {name}, as a valued client, we're offering you priority scheduling for recurring service. Book your preferred day before spots fill up. Reply STOP to opt out.`,
    helpMessage: `Reply HELP for help. Contact ${data.businessEmail} or call ${data.businessPhone}.`,
    helpKeywords: 'HELP,INFO',
    optinMessage: `You've opted in to receive messages from ${data.businessName}. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to cancel.`,
    optinKeywords: 'START,YES,SUBSCRIBE',
    optoutMessage: `You've been unsubscribed from ${data.businessName} messages. No more messages will be sent. Reply START to re-subscribe.`,
    optoutKeywords: 'STOP,CANCEL,UNSUBSCRIBE,QUIT',
    subscriberOptin: true,
    subscriberOptout: true,
    subscriberHelp: true,
    embeddedLink: true,
    embeddedPhone: false,
    numberPool: false,
    ageGated: false,
    directLending: false,
    affiliateMarketing: false,
    autoRenewal: true,
    termsAndConditions: true,
  });
  return { campaignId: result.data?.campaignId || result.campaignId || result.data?.id };
}

// ============================================
// PHONE NUMBER MANAGEMENT
// ============================================

export async function searchNumbers(state: string, limit = 5): Promise<Array<{ phoneNumber: string; locality: string }>> {
  const params = new URLSearchParams({
    'filter[country_code]': 'US',
    'filter[state]': state,
    'filter[features][]': 'sms',
    'filter[limit]': String(limit),
  });
  const result = await telnyxRequest('GET', `/v2/available_phone_numbers?${params}`);
  return (result.data || []).map((n: any) => ({
    phoneNumber: n.phone_number,
    locality: n.locality || n.region_information?.[0]?.region_name || '',
  }));
}

export async function purchaseNumber(phoneNumber: string, messagingProfileId: string): Promise<{ orderId: string }> {
  const result = await telnyxRequest('POST', '/v2/number_orders', {
    phone_numbers: [{ phone_number: phoneNumber }],
    messaging_profile_id: messagingProfileId,
  });
  return { orderId: result.data?.id };
}

export async function assignNumberToCampaign(phoneNumber: string, campaignId: string): Promise<void> {
  await telnyxRequest('POST', '/v2/phone_number_campaigns', {
    phoneNumber,
    campaignId,
  });
}

// ============================================
// MESSAGE SENDING
// ============================================

export async function sendSmsViaTelnyx(params: {
  from: string;
  to: string;
  text: string;
  messagingProfileId: string;
}): Promise<{ messageId: string; status: string }> {
  const result = await telnyxRequest('POST', '/v2/messages', {
    from: params.from,
    to: params.to,
    text: params.text,
    messaging_profile_id: params.messagingProfileId,
  });
  return {
    messageId: result.data?.id,
    status: result.data?.to?.[0]?.status || 'queued',
  };
}

// ============================================
// MESSAGING PROFILE
// ============================================

export async function createMessagingProfile(name: string, webhookUrl: string): Promise<{ profileId: string }> {
  const result = await telnyxRequest('POST', '/v2/messaging_profiles', {
    name,
    webhook_url: webhookUrl,
    webhook_api_version: '2',
  });
  return { profileId: result.data?.id };
}
