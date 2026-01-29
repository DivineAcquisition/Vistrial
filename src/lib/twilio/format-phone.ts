import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js"

/**
 * Format phone number to E.164 format (+15551234567)
 * Returns null if invalid
 */
export function formatPhoneE164(
  phone: string,
  defaultCountry: CountryCode = "US"
): string | null {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone, defaultCountry)

    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format("E.164")
    }

    return null
  } catch {
    return null
  }
}

/**
 * Format phone number for display: (555) 123-4567
 */
export function formatPhoneDisplay(phone: string): string {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone, "US")

    if (phoneNumber) {
      return phoneNumber.formatNational()
    }

    // Fallback: basic formatting
    const cleaned = phone.replace(/\D/g, "")
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }

    return phone
  } catch {
    return phone
  }
}

/**
 * Validate if phone number is valid
 */
export function isValidPhone(phone: string, defaultCountry: CountryCode = "US"): boolean {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone, defaultCountry)
    return phoneNumber?.isValid() ?? false
  } catch {
    return false
  }
}

/**
 * Extract digits only from phone string
 */
export function extractDigits(phone: string): string {
  return phone.replace(/\D/g, "")
}
