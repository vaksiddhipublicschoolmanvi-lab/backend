CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_status_created_at
  ON whatsapp_message_logs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_recipient_status_created_at
  ON whatsapp_message_logs (recipient_phone, status, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_status_scheduled_at
  ON whatsapp_message_queue (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_opt_ins_phone
  ON whatsapp_opt_ins (phone);
