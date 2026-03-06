// ============================================
// EMPTY INBOX
// Empty state for inbox
// ============================================

import { Inbox } from 'lucide-react';

export function EmptyInbox() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Select a conversation</h3>
      <p className="text-muted-foreground max-w-sm">
        Choose a conversation from the list to view messages and reply to your customers.
      </p>
    </div>
  );
}
