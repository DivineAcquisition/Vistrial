// @ts-nocheck
// ============================================
// CSV UPLOAD PAGE
// Multi-step CSV import wizard
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { CsvUploadWizard } from '@/components/contacts/csv-upload-wizard';

export const metadata: Metadata = {
  title: 'Import Contacts',
};

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  return (
    <CsvUploadWizard
      organizationId={context.organization.id}
      contactLimit={context.organization.contact_limit || 1000}
    />
  );
}
