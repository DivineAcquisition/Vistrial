// ============================================
// INBOX TYPE DEFINITIONS
// ============================================

export interface Conversation {
  id: string;
  organization_id: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  last_message: string;
  last_message_at: string;
  last_message_direction: 'inbound' | 'outbound';
  unread_count: number;
  workflow_id: string | null;
  workflow_name: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  contact_id: string;
  direction: 'inbound' | 'outbound';
  type: 'sms' | 'voice_drop' | 'email';
  content: string;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}
