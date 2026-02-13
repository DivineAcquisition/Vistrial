// ============================================
// TELNYX PHONE NUMBER MANAGEMENT
// ============================================

import { telnyxApiClient } from './api-client';

const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;

export interface AvailableNumber {
  phone_number: string;
  region_information: any[];
  cost_information: { upfront_cost: string; monthly_cost: string };
  features: string[];
}

export interface PurchasedNumber {
  id: string;
  phone_number: string;
  status: string;
  messaging_profile_id?: string;
}

/**
 * Search for available phone numbers by area code
 */
export async function searchAvailableNumbers(
  areaCode: string,
  limit = 10
): Promise<AvailableNumber[]> {
  try {
    const response = await telnyxApiClient.get<AvailableNumber[]>(
      `/available_phone_numbers?filter[country_code]=US&filter[national_destination_code]=${areaCode}&filter[features][]=sms&filter[features][]=mms&filter[limit]=${limit}`
    );
    return response.data || [];
  } catch (error) {
    console.error('Search numbers error:', error);
    throw error;
  }
}

/**
 * Purchase a phone number
 */
export async function purchaseNumber(phoneNumber: string): Promise<PurchasedNumber> {
  try {
    const response = await telnyxApiClient.post<any>('/number_orders', {
      phone_numbers: [{ phone_number: phoneNumber }],
      messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID,
    });

    const orderedNumber = response.data.phone_numbers?.[0];
    if (!orderedNumber) throw new Error('No number returned from order');

    return {
      id: orderedNumber.id,
      phone_number: orderedNumber.phone_number,
      status: orderedNumber.status,
    };
  } catch (error) {
    console.error('Purchase number error:', error);
    throw error;
  }
}

/**
 * Configure a phone number with messaging profile
 */
export async function configureNumber(
  phoneNumberId: string,
  messagingProfileId: string = TELNYX_MESSAGING_PROFILE_ID!
): Promise<void> {
  try {
    await telnyxApiClient.patch(`/phone_numbers/${phoneNumberId}`, {
      messaging_profile_id: messagingProfileId,
    });
  } catch (error) {
    console.error('Configure number error:', error);
    throw error;
  }
}

/**
 * Get list of owned phone numbers
 */
export async function getOwnedNumbers(): Promise<PurchasedNumber[]> {
  try {
    const response = await telnyxApiClient.get<PurchasedNumber[]>(
      '/phone_numbers?filter[status]=active'
    );
    return response.data || [];
  } catch (error) {
    console.error('Get owned numbers error:', error);
    throw error;
  }
}
