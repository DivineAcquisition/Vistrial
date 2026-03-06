// ============================================
// UNSUBSCRIBE PAGE
// Allow contacts to unsubscribe from emails
// ============================================

import { Metadata } from 'next';
import { UnsubscribeForm } from '@/components/unsubscribe/unsubscribe-form';

export const metadata: Metadata = {
  title: 'Unsubscribe | Vistrial',
};

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { contact?: string; org?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <UnsubscribeForm
        contactId={searchParams.contact}
        organizationId={searchParams.org}
      />
    </div>
  );
}
