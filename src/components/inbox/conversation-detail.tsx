'use client';

// ============================================
// CONVERSATION DETAIL
// Message thread and reply input
// ============================================

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Send,
  Phone,
  Mail,
  MoreVertical,
  User,
  CheckCircle,
  Star,
  Clock,
  XCircle,
  MessageSquare,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { QuickReplyTemplates } from './quick-reply-templates';
import { cn } from '@/lib/utils/cn';
import type { Conversation, Message } from '@/types/inbox';

interface ConversationDetailProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  onUpdateStatus: (status: string) => Promise<void>;
  isLoading: boolean;
}

const statusOptions = [
  { value: 'new', label: 'New', icon: MessageSquare, color: 'text-blue-600' },
  { value: 'interested', label: 'Interested', icon: Star, color: 'text-yellow-600' },
  { value: 'needs_response', label: 'Needs Response', icon: Clock, color: 'text-orange-600' },
  { value: 'booked', label: 'Booked', icon: CheckCircle, color: 'text-green-600' },
  { value: 'closed', label: 'Closed', icon: XCircle, color: 'text-gray-600' },
];

export function ConversationDetail({
  conversation,
  messages,
  onSendMessage,
  onUpdateStatus,
  isLoading,
}: ConversationDetailProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectTemplate = (template: string) => {
    // Replace variables
    const processed = template
      .replace('{{first_name}}', conversation.contact_name?.split(' ')[0] || 'there')
      .replace('{{business_name}}', 'Your Business'); // TODO: Get from org

    setMessage(processed);
    setShowTemplates(false);
    textareaRef.current?.focus();
  };

  const currentStatus = statusOptions.find((s) => s.value === conversation.status);

  return (
    <>
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white">
              {conversation.contact_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{conversation.contact_name || 'Unknown'}</h2>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {conversation.contact_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {conversation.contact_phone}
                </span>
              )}
              {conversation.contact_email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {conversation.contact_email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {currentStatus && (
                  <currentStatus.icon className={cn('h-4 w-4 mr-2', currentStatus.color)} />
                )}
                {currentStatus?.label || 'Status'}
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {statusOptions.map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={() => onUpdateStatus(status.value)}
                >
                  <status.icon className={cn('h-4 w-4 mr-2', status.color)} />
                  {status.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <User className="h-4 w-4 mr-2" />
                View Contact
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Zap className="h-4 w-4 mr-2" />
                View Workflow
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <XCircle className="h-4 w-4 mr-2" />
                Opt Out Contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <Skeleton className="h-16 w-64 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const isOutbound = msg.direction === 'outbound';
              const showDate =
                index === 0 ||
                new Date(msg.created_at).toDateString() !==
                  new Date(messages[index - 1].created_at).toDateString();

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {format(new Date(msg.created_at), 'MMMM d, yyyy')}
                      </span>
                    </div>
                  )}

                  <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[70%] rounded-lg px-4 py-2',
                        isOutbound
                          ? 'bg-blue-600 text-white'
                          : 'bg-muted'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div
                        className={cn(
                          'flex items-center gap-2 mt-1 text-xs',
                          isOutbound ? 'text-white/70' : 'text-muted-foreground'
                        )}
                      >
                        <span>{format(new Date(msg.created_at), 'h:mm a')}</span>
                        {isOutbound && msg.status && (
                          <span className="capitalize">• {msg.status}</span>
                        )}
                        {msg.type === 'voice_drop' && (
                          <span>• Voice Drop</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply Input */}
      <div className="border-t p-4">
        {showTemplates && (
          <QuickReplyTemplates
            onSelect={handleSelectTemplate}
            onClose={() => setShowTemplates(false)}
          />
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="min-h-[80px] max-h-[200px] resize-none pr-20"
              disabled={isSending}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplates(!showTemplates)}
                className="h-8 px-2 text-muted-foreground"
              >
                <Zap className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className="h-10"
          >
            <Send className="h-4 w-4 mr-2" />
            Send
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </>
  );
}
