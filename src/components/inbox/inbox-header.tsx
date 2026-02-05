'use client';

// ============================================
// INBOX HEADER
// Header with filters and search
// ============================================

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Inbox } from 'lucide-react';

interface InboxHeaderProps {
  filter: string;
  onFilterChange: (filter: string) => void;
  unreadCount: number;
}

export function InboxHeader({
  filter,
  onFilterChange,
  unreadCount,
}: InboxHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6" />
          Inbox
        </h1>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="rounded-full">
            {unreadCount} unread
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Messages</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="needs_response">Needs Response</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
