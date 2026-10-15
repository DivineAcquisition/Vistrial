export const GA_ID_PATTERN = /^G-[A-Z0-9]+$/;
export const META_PIXEL_PATTERN = /^\d{5,20}$/;

export function googleAnalyticsId(): string | null {
  const value = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
  return GA_ID_PATTERN.test(value) ? value : null;
}

export function metaPixelId(): string | null {
  const value = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";
  return META_PIXEL_PATTERN.test(value) ? value : null;
}
