// ============================================
// TELNYX NUMBER LOOKUP SERVICE
// Validates phone numbers before sending SMS
// ============================================

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_BASE_URL = 'https://api.telnyx.com/v2';

export interface NumberLookupResult {
  phoneNumber: string;
  valid: boolean;
  canReceiveSMS: boolean;
  phoneType: 'mobile' | 'landline' | 'voip' | 'unknown';
  carrier: {
    name: string;
    type: string;
    mobileCountryCode?: string;
    mobileNetworkCode?: string;
  } | null;
  callerName: {
    name: string;
    type: string;
  } | null;
  nationalFormat: string;
  countryCode: string;
  error?: string;
}

export interface BulkValidationResult {
  total: number;
  valid: number;
  invalid: number;
  mobile: number;
  landline: number;
  voip: number;
  unknown: number;
  results: NumberLookupResult[];
  invalidNumbers: NumberLookupResult[];
  landlineNumbers: NumberLookupResult[];
}

/**
 * Format phone number to E.164 format
 */
export function formatToE164(phone: string, defaultCountry = 'US'): string {
  // Remove all non-numeric characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If starts with +, assume it's already E.164
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // If starts with 1 and is 11 digits, add +
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return `+${cleaned}`;
  }
  
  // If 10 digits, assume US and add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // Return as-is with + prefix
  return `+${cleaned}`;
}

/**
 * Lookup a single phone number
 */
export async function lookupNumber(phoneNumber: string): Promise<NumberLookupResult> {
  const formattedNumber = formatToE164(phoneNumber);
  
  try {
    const response = await fetch(
      `${TELNYX_BASE_URL}/number_lookup/${encodeURIComponent(formattedNumber)}?type=carrier&type=caller-name`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Handle specific error codes
      if (response.status === 404 || response.status === 400) {
        return {
          phoneNumber: formattedNumber,
          valid: false,
          canReceiveSMS: false,
          phoneType: 'unknown',
          carrier: null,
          callerName: null,
          nationalFormat: phoneNumber,
          countryCode: '',
          error: 'Invalid phone number',
        };
      }
      
      throw new Error(errorData.errors?.[0]?.detail || 'Lookup failed');
    }

    const data = await response.json();
    const result = data.data;

    // Determine phone type from carrier info
    let phoneType: 'mobile' | 'landline' | 'voip' | 'unknown' = 'unknown';
    const carrierType = result.carrier?.type?.toLowerCase() || '';
    
    if (carrierType.includes('mobile') || carrierType.includes('wireless')) {
      phoneType = 'mobile';
    } else if (carrierType.includes('landline') || carrierType.includes('fixed')) {
      phoneType = 'landline';
    } else if (carrierType.includes('voip') || carrierType.includes('virtual')) {
      phoneType = 'voip';
    }

    // Can receive SMS if mobile or VOIP (most VOIP can receive SMS)
    const canReceiveSMS = phoneType === 'mobile' || phoneType === 'voip';

    return {
      phoneNumber: result.phone_number || formattedNumber,
      valid: true,
      canReceiveSMS,
      phoneType,
      carrier: result.carrier ? {
        name: result.carrier.name || 'Unknown',
        type: result.carrier.type || 'Unknown',
        mobileCountryCode: result.carrier.mobile_country_code,
        mobileNetworkCode: result.carrier.mobile_network_code,
      } : null,
      callerName: result.caller_name ? {
        name: result.caller_name.caller_name || '',
        type: result.caller_name.caller_type || '',
      } : null,
      nationalFormat: result.national_format || phoneNumber,
      countryCode: result.country_code || 'US',
    };
  } catch (error) {
    console.error('Number lookup error:', error);
    return {
      phoneNumber: formattedNumber,
      valid: false,
      canReceiveSMS: false,
      phoneType: 'unknown',
      carrier: null,
      callerName: null,
      nationalFormat: phoneNumber,
      countryCode: '',
      error: error instanceof Error ? error.message : 'Lookup failed',
    };
  }
}

/**
 * Lookup multiple phone numbers with rate limiting
 * Telnyx allows ~10 requests/second
 */
export async function lookupNumbers(
  phoneNumbers: string[],
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<BulkValidationResult> {
  const {
    batchSize = 10,
    delayBetweenBatches = 1000,
    onProgress,
  } = options;

  const results: NumberLookupResult[] = [];
  const uniqueNumbers = [...new Set(phoneNumbers.map(formatToE164))];

  // Process in batches
  for (let i = 0; i < uniqueNumbers.length; i += batchSize) {
    const batch = uniqueNumbers.slice(i, i + batchSize);
    
    // Process batch concurrently
    const batchResults = await Promise.all(
      batch.map((phone) => lookupNumber(phone))
    );
    
    results.push(...batchResults);
    
    // Report progress
    if (onProgress) {
      onProgress(results.length, uniqueNumbers.length);
    }
    
    // Delay between batches to respect rate limits
    if (i + batchSize < uniqueNumbers.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Calculate summary
  const valid = results.filter((r) => r.valid);
  const invalid = results.filter((r) => !r.valid);
  const mobile = results.filter((r) => r.phoneType === 'mobile');
  const landline = results.filter((r) => r.phoneType === 'landline');
  const voip = results.filter((r) => r.phoneType === 'voip');
  const unknown = results.filter((r) => r.phoneType === 'unknown' && r.valid);

  return {
    total: results.length,
    valid: valid.length,
    invalid: invalid.length,
    mobile: mobile.length,
    landline: landline.length,
    voip: voip.length,
    unknown: unknown.length,
    results,
    invalidNumbers: invalid,
    landlineNumbers: landline,
  };
}

/**
 * Quick check if a single number can receive SMS
 */
export async function canReceiveSMS(phoneNumber: string): Promise<boolean> {
  const result = await lookupNumber(phoneNumber);
  return result.canReceiveSMS;
}

/**
 * Get cost estimate for bulk validation
 * ~$0.01-0.03 per lookup
 */
export function estimateLookupCost(count: number, costPerLookup = 0.015): number {
  return count * costPerLookup;
}
