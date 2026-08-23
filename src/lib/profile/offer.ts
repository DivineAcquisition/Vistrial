export function coalesceOfferName(
  leadOfferName: string | null | undefined,
  profileOfferName: string | null | undefined
): string | null {
  const lead = leadOfferName?.trim() || null;
  if (lead) return lead;
  const profile = profileOfferName?.trim() || null;
  return profile;
}
