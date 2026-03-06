// ============================================
// BOOKING FORM PREVIEW
// Static demo page — no database required
// Visit: /book/preview
// ============================================

import { Metadata } from 'next';
import { BookingFormPreviewClient } from './client';

export const metadata: Metadata = {
  title: 'Booking Form Preview',
  description: 'Preview of the Vistrial booking form with SMS consent',
};

export default function BookingPreviewPage() {
  return <BookingFormPreviewClient />;
}
