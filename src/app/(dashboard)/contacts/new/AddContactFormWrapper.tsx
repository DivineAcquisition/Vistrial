'use client';

import { useRouter } from 'next/navigation';
import { AddContactForm } from '@/components/contacts/add-contact-form';

export function AddContactFormWrapper({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  return (
    <AddContactForm
      organizationId={organizationId}
      onSuccess={() => router.push('/contacts')}
    />
  );
}
