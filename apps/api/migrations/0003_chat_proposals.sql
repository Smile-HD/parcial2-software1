-- Migration 0003: Add delta_id and delta to chat_messages for AI proposals
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delta_id text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delta jsonb;
