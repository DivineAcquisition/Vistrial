'use client';

// ============================================
// INBOX LAYOUT
// Main inbox layout with conversation list and detail view
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationList } from './conversation-list';
import { ConversationDetail } from './conversation-detail';
import { InboxHeader } from './inbox-header';
import { EmptyInbox } from './empty-inbox';
import { useToast } from '@/hooks/use-toast';
import type { Conversation, Message } from '@/types/inbox';

interface InboxLayoutProps {
  organizationId: string;
  selectedConversationId?: string;
  filter: string;
}

export function InboxLayout({
  organizationId,
  selectedConversationId,
  filter,
}: InboxLayoutProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);

    try {
      const response = await fetch(`/api/inbox/conversations?filter=${filter}`);
      const data = await response.json();

      if (response.ok) {
        setConversations(data.conversations);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [filter]);

  const fetchMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setIsLoadingMessages(true);

    try {
      const response = await fetch(`/api/inbox/conversations/${conversationId}/messages`);
      const data = await response.json();

      if (response.ok) {
        setMessages(data.messages);
        setSelectedConversation(data.conversation);

        // Mark as read
        if (data.conversation?.unread_count > 0) {
          markAsRead(conversationId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      if (!silent) setIsLoadingMessages(false);
    }
  }, []);

  const markAsRead = async (conversationId: string) => {
    try {
      await fetch(`/api/inbox/conversations/${conversationId}/read`, {
        method: 'POST',
      });

      // Update local state
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Fetch conversations
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages when conversation is selected
  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
    } else {
      setSelectedConversation(null);
      setMessages([]);
    }
  }, [selectedConversationId, fetchMessages]);

  // Poll for new messages (simple polling, can be replaced with real-time)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(true);
      if (selectedConversationId) {
        fetchMessages(selectedConversationId, true);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [selectedConversationId, filter, fetchConversations, fetchMessages]);

  const handleSelectConversation = (conversationId: string) => {
    router.push(`/inbox?conversation=${conversationId}&filter=${filter}`);
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedConversation) return;

    try {
      const response = await fetch(
        `/api/inbox/conversations/${selectedConversation.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        // Add message to list
        setMessages((prev) => [...prev, data.message]);

        // Update conversation in list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConversation.id
              ? {
                  ...c,
                  last_message: content,
                  last_message_at: new Date().toISOString(),
                }
              : c
          )
        );
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedConversation) return;

    try {
      const response = await fetch(
        `/api/inbox/conversations/${selectedConversation.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );

      if (response.ok) {
        setSelectedConversation((prev) =>
          prev ? { ...prev, status } : null
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConversation.id ? { ...c, status } : c
          )
        );

        toast({
          title: 'Status updated',
          description: `Conversation marked as ${status}`,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleFilterChange = (newFilter: string) => {
    router.push(`/inbox?filter=${newFilter}`);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <InboxHeader
        filter={filter}
        onFilterChange={handleFilterChange}
        unreadCount={unreadCount}
      />

      <div className="flex-1 flex overflow-hidden border rounded-lg bg-background">
        {/* Conversation List */}
        <div className="w-80 lg:w-96 border-r flex flex-col">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            isLoading={isLoading}
          />
        </div>

        {/* Conversation Detail */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <ConversationDetail
              conversation={selectedConversation}
              messages={messages}
              onSendMessage={handleSendMessage}
              onUpdateStatus={handleUpdateStatus}
              isLoading={isLoadingMessages}
            />
          ) : (
            <EmptyInbox />
          )}
        </div>
      </div>
    </div>
  );
}
