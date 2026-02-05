-- ============================================
-- CONVERSATIONS TABLE
-- For two-way inbox functionality
-- ============================================

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  -- Status: new, interested, needs_response, booked, closed
  
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_direction VARCHAR(20), -- inbound, outbound
  
  unread_count INTEGER NOT NULL DEFAULT 0,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(organization_id, contact_id)
);

-- Conversation messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  type VARCHAR(50) NOT NULL DEFAULT 'sms', -- sms, voice_drop, email
  content TEXT NOT NULL,
  
  status VARCHAR(50), -- sent, delivered, failed, received
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(organization_id, unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(organization_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_created ON conversation_messages(conversation_id, created_at);

-- RLS Policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations in their organization" ON conversations;
DROP POLICY IF EXISTS "Users can view messages in their organization" ON conversation_messages;

CREATE POLICY "Users can view conversations in their organization" ON conversations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update conversations in their organization" ON conversations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view messages in their organization" ON conversation_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Function to create/update conversation on inbound message
CREATE OR REPLACE FUNCTION handle_inbound_message()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation_id UUID;
  v_org_id UUID;
BEGIN
  -- Get organization ID from contact
  SELECT organization_id INTO v_org_id
  FROM contacts
  WHERE id = NEW.contact_id;

  -- Find or create conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE organization_id = v_org_id AND contact_id = NEW.contact_id;

  IF v_conversation_id IS NULL THEN
    -- Create new conversation
    INSERT INTO conversations (
      organization_id,
      contact_id,
      status,
      last_message,
      last_message_at,
      last_message_direction,
      unread_count
    )
    VALUES (
      v_org_id,
      NEW.contact_id,
      'new',
      NEW.content,
      now(),
      'inbound',
      1
    )
    RETURNING id INTO v_conversation_id;
  ELSE
    -- Update existing conversation
    UPDATE conversations
    SET
      last_message = NEW.content,
      last_message_at = now(),
      last_message_direction = 'inbound',
      unread_count = unread_count + 1,
      status = CASE 
        WHEN status = 'closed' THEN 'needs_response'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_conversation_id;
  END IF;

  -- Create conversation message
  INSERT INTO conversation_messages (
    conversation_id,
    contact_id,
    direction,
    type,
    content,
    status,
    created_at
  )
  VALUES (
    v_conversation_id,
    NEW.contact_id,
    'inbound',
    'sms',
    NEW.content,
    'received',
    NEW.created_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_inbound_message ON inbound_messages;

-- Trigger for inbound messages (only create if inbound_messages table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inbound_messages') THEN
    CREATE TRIGGER on_inbound_message
      AFTER INSERT ON inbound_messages
      FOR EACH ROW
      EXECUTE FUNCTION handle_inbound_message();
  END IF;
END
$$;

-- Function to sync outbound messages to conversation
CREATE OR REPLACE FUNCTION sync_outbound_to_conversation()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation_id UUID;
  v_org_id UUID;
BEGIN
  -- Only process SMS messages
  IF NEW.type != 'sms' THEN
    RETURN NEW;
  END IF;

  -- Get organization ID
  v_org_id := NEW.organization_id;

  -- Find or create conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE organization_id = v_org_id AND contact_id = NEW.contact_id;

  IF v_conversation_id IS NULL THEN
    -- Create new conversation
    INSERT INTO conversations (
      organization_id,
      contact_id,
      workflow_id,
      status,
      last_message,
      last_message_at,
      last_message_direction,
      unread_count
    )
    VALUES (
      v_org_id,
      NEW.contact_id,
      NEW.workflow_id,
      'new',
      NEW.content,
      now(),
      'outbound',
      0
    )
    RETURNING id INTO v_conversation_id;
  ELSE
    -- Update existing conversation
    UPDATE conversations
    SET
      last_message = NEW.content,
      last_message_at = now(),
      last_message_direction = 'outbound',
      workflow_id = COALESCE(NEW.workflow_id, workflow_id),
      updated_at = now()
    WHERE id = v_conversation_id;
  END IF;

  -- Create conversation message
  INSERT INTO conversation_messages (
    conversation_id,
    contact_id,
    direction,
    type,
    content,
    status,
    sent_at,
    metadata,
    created_at
  )
  VALUES (
    v_conversation_id,
    NEW.contact_id,
    'outbound',
    NEW.type,
    NEW.content,
    NEW.status,
    NEW.sent_at,
    jsonb_build_object(
      'message_id', NEW.id,
      'workflow_id', NEW.workflow_id,
      'workflow_step_id', NEW.workflow_step_id
    ),
    NEW.created_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_outbound_message ON messages;

-- Trigger for outbound messages (only create if messages table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    CREATE TRIGGER on_outbound_message
      AFTER INSERT ON messages
      FOR EACH ROW
      EXECUTE FUNCTION sync_outbound_to_conversation();
  END IF;
END
$$;
