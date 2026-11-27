-- Для каждого участника чата помним последнее прочитанное сообщение
ALTER TABLE room_members
  ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT NOT NULL DEFAULT 0;

-- Все сообщения, которые уже есть, считаем прочитанными
UPDATE room_members m
SET last_read_message_id = COALESCE(
  (SELECT MAX(id) FROM messages WHERE room_id = m.room_id), 0
);