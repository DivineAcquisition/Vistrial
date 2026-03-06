// ============================================
// INBOX PAGE
// Main conversation inbox
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { InboxLayout } from '@/components/inbox/inbox-layout';

export const metadata: Metadata = {
  title: 'Inbox | Vistrial',
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { conversation?: string; filter?: string };
}) {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  return (
    <InboxLayout
      organizationId={context.organization.id}
      selectedConversationId={searchParams.conversation}
      filter={searchParams.filter || 'all'}
    />
  );
}
