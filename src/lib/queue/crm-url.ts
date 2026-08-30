/**
 * Deep link to a contact's conversation in the connected CRM.
 * Built from the org location id and the lead contact id — never guessed.
 */
export function ghlConversationUrl(
  locationId: string | null | undefined,
  contactId: string | null | undefined
): string | null {
  const location = locationId?.trim() ?? "";
  const contact = contactId?.trim() ?? "";
  if (!location || !contact) return null;
  return `https://app.gohighlevel.com/v2/location/${encodeURIComponent(location)}/conversations/all?contactId=${encodeURIComponent(contact)}`;
}
