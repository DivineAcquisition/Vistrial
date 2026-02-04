-- Vistrial Seed Data
-- This file contains sample data for development and testing

-- Note: Run this after all migrations have been applied
-- Usage: supabase db seed

-- ============================================
-- Sample Business Types (if table exists)
-- ============================================

-- These are handled by constants/business-types.ts
-- but could be stored in database for customization

-- ============================================
-- Sample Workflow Templates (if table exists)
-- ============================================

-- INSERT INTO workflow_templates (id, name, description, category, steps, settings, created_at)
-- VALUES
--   (
--     'reactivation-sms-basic',
--     'Basic SMS Reactivation',
--     'Simple 3-step SMS sequence to re-engage dormant leads',
--     'reactivation',
--     '[
--       {"type": "sms", "order": 1, "content": "Hi {{first_name}}, it''s been a while! {{business_name}} here. We''d love to help with your next project. Reply YES to learn about our current offers!"},
--       {"type": "delay", "order": 2, "delay_value": 3, "delay_unit": "days"},
--       {"type": "sms", "order": 3, "content": "{{first_name}}, just checking in - any home service needs we can help with? We''re offering 15% off for returning customers!"}
--     ]'::jsonb,
--     '{"send_window_start": "09:00", "send_window_end": "20:00", "respect_opt_out": true}'::jsonb,
--     NOW()
--   ),
--   (
--     'reactivation-voice',
--     'Voice Reactivation',
--     'Personal voice call follow-up for high-value leads',
--     'reactivation',
--     '[
--       {"type": "voice", "order": 1, "content": "Hi {{first_name}}, this is a friendly call from {{business_name}}. We noticed it''s been a while since we last helped you, and we wanted to reach out personally."}
--     ]'::jsonb,
--     '{"send_window_start": "10:00", "send_window_end": "18:00", "respect_opt_out": true}'::jsonb,
--     NOW()
--   );

-- ============================================
-- Test Business (for development only)
-- ============================================

-- Uncomment and modify for local development testing
-- DO NOT use in production

-- INSERT INTO businesses (id, owner_id, name, slug, email, phone, is_active, credit_balance, monthly_credits, created_at)
-- VALUES (
--   'test-business-001',
--   'test-user-001',  -- Must match a valid user ID
--   'Test Cleaning Co',
--   'test-cleaning-co',
--   'test@example.com',
--   '+15551234567',
--   true,
--   500,
--   500,
--   NOW()
-- );

-- ============================================
-- Test Contacts (for development only)
-- ============================================

-- INSERT INTO contacts (id, business_id, first_name, last_name, phone, email, status, created_at)
-- VALUES
--   ('contact-001', 'test-business-001', 'John', 'Smith', '+15551111111', 'john@example.com', 'active', NOW()),
--   ('contact-002', 'test-business-001', 'Jane', 'Doe', '+15552222222', 'jane@example.com', 'active', NOW()),
--   ('contact-003', 'test-business-001', 'Bob', 'Johnson', '+15553333333', 'bob@example.com', 'active', NOW());

-- ============================================
-- Notes
-- ============================================

-- 1. This seed file is for development purposes
-- 2. For production, data should be created through the application
-- 3. Ensure all foreign key relationships are valid before inserting
-- 4. UUID values should be generated properly in actual usage
