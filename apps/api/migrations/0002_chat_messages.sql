-- Migration 0002: Create chat_messages table with composite isolation and TTL index
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id   uuid NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  sender_name  text NOT NULL,
  sender_type  text NOT NULL,
  channel_type text NOT NULL,
  target_user  text,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_group 
  ON chat_messages (diagram_id, channel_type, created_at ASC)
  WHERE channel_type = 'group';

CREATE INDEX IF NOT EXISTS idx_chat_direct 
  ON chat_messages (diagram_id, channel_type, device_id, target_user, created_at ASC)
  WHERE channel_type = 'direct_bot';

CREATE INDEX IF NOT EXISTS idx_chat_ttl 
  ON chat_messages (created_at ASC);
