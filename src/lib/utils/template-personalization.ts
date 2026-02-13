// ============================================
// TEMPLATE PERSONALIZATION
// ============================================

interface PersonalizationData {
  contact: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
  organization: {
    name?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  booking_link?: string;
}

/**
 * Replace template variables with actual values
 */
export function personalizeTemplate(
  template: string,
  data: PersonalizationData
): string {
  const { contact, organization, booking_link } = data;

  let result = template;

  // Contact variables
  result = result.replace(/\{\{first_name\}\}/gi, contact.first_name || 'there');
  result = result.replace(/\{\{last_name\}\}/gi, contact.last_name || '');
  result = result.replace(
    /\{\{full_name\}\}/gi,
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'there'
  );
  result = result.replace(/\{\{phone\}\}/gi, contact.phone || '');
  result = result.replace(/\{\{email\}\}/gi, contact.email || '');

  // Organization variables
  result = result.replace(/\{\{business_name\}\}/gi, organization.name || '');
  result = result.replace(/\{\{business_phone\}\}/gi, organization.phone || '');
  result = result.replace(/\{\{business_email\}\}/gi, organization.email || '');
  result = result.replace(/\{\{website\}\}/gi, organization.website || '');

  // Booking link
  result = result.replace(/\{\{booking_link\}\}/gi, booking_link || '');

  // Clean up any remaining unmatched variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  // Clean up extra spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
