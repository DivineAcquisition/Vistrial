/**
 * Add Contact Page
 *
 * Renders the AddContactForm for creating a new contact.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { RiArrowLeftLine } from '@remixicon/react';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { AddContactFormWrapper } from './AddContactFormWrapper';

export const metadata: Metadata = {
  title: 'Add Contact',
  description: 'Add a new contact to your database',
};

export const dynamic = 'force-dynamic';

export default async function NewContactPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const org = context.organization as { id: string };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <RiArrowLeftLine className="w-4 h-4" />
          Back to contacts
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add Contact</h1>
        <p className="text-gray-500 mt-1">
          Add a new contact to your database
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 max-w-lg">
        <AddContactFormWrapper organizationId={org.id} />
      </div>
    </div>
  );
}
