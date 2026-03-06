'use client';

// ============================================
// CONVERSATION LIST
// List of conversations in sidebar
// ============================================

import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/cn';
import type { Conversation } from '@/types/inbox';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  Star,
  XCircle,
} from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

const statusIcons: Record<string, React.ElementType> = {
  new: MessageSquare,
  interested: Star,
  needs_response: Clock,
  booked: CheckCircle,
  closed: XCircle,
};

const statusColors: Record<string, string> = {
  new: 'bg-brand-100 text-brand-700',
  interested: 'bg-yellow-100 text-yellow-700',
  needs_response: 'bg-orange-100 text-orange-700',
  booked: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
}: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <MessageSquare className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-600">No conversations yet</p>
        <p className="text-sm text-gray-500">
          When contacts respond to your campaigns, they&apos;ll appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-gray-100">
        {conversations.map((conversation) => {
          const StatusIcon = statusIcons[conversation.status] || MessageSquare;

          return (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={cn(
                'w-full p-4 text-left hover:bg-gray-50 transition-colors',
                selectedId === conversation.id && 'bg-brand-50',
                conversation.unread_count > 0 && 'bg-brand-50/50'
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-brand-gradient text-white">
                    {conversation.contact_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'font-medium text-gray-900 truncate',
                        conversation.unread_count > 0 && 'font-semibold'
                      )}
                    >
                      {conversation.contact_name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatDistanceToNow(new Date(conversation.last_message_at), {
                        addSuffix: false,
                      })}
                    </span>
                  </div>

                  <p
                    className={cn(
                      'text-sm truncate mt-0.5',
                      conversation.unread_count > 0
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-500'
                    )}
                  >
                    {conversation.last_message_direction === 'outbound' && (
                      <span className="text-gray-500">You: </span>
                    )}
                    {conversation.last_message}
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="secondary"
                      className={cn('text-xs border-0', statusColors[conversation.status])}
                    >
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {conversation.status.replace('_', ' ')}
                    </Badge>

                    {conversation.unread_count > 0 && (
                      <Badge className="rounded-full h-5 w-5 p-0 justify-center bg-brand-600 text-white border-0">
                        {conversation.unread_count}
                      </Badge>
                    )}

                    {conversation.workflow_name && (
                      <span className="text-xs text-gray-500 truncate">
                        {conversation.workflow_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
