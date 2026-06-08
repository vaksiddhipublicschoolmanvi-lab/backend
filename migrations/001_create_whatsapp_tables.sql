CREATE TABLE IF NOT EXISTS whatsapp_message_queue (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NULL,
  student_id INTEGER NULL,
  admission_id INTEGER NULL,
  parent_id INTEGER NULL,
  recipient_name VARCHAR(150),
  recipient_phone VARCHAR(20) NOT NULL,
  message_type VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  message_text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  priority INTEGER DEFAULT 5,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMP NULL,
  processing_started_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  failed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  whatsapp_message_id TEXT NULL,
  error_message TEXT NULL,
  created_by INTEGER NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_status
  ON whatsapp_message_queue (status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_scheduled_at
  ON whatsapp_message_queue (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_recipient_phone
  ON whatsapp_message_queue (recipient_phone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_message_type
  ON whatsapp_message_queue (message_type);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_admission_id
  ON whatsapp_message_queue (admission_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queue_student_id
  ON whatsapp_message_queue (student_id);

CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT,
  organization_id INTEGER NULL,
  student_id INTEGER NULL,
  admission_id INTEGER NULL,
  parent_id INTEGER NULL,
  recipient_name VARCHAR(150),
  recipient_phone VARCHAR(20),
  message_type VARCHAR(50),
  message_text TEXT,
  status VARCHAR(20),
  whatsapp_message_id TEXT NULL,
  error_message TEXT NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_opt_ins (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150),
  is_opted_in BOOLEAN DEFAULT true,
  source VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_message_queue_updated_at ON whatsapp_message_queue;
CREATE TRIGGER trg_whatsapp_message_queue_updated_at
BEFORE UPDATE ON whatsapp_message_queue
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_opt_ins_updated_at ON whatsapp_opt_ins;
CREATE TRIGGER trg_whatsapp_opt_ins_updated_at
BEFORE UPDATE ON whatsapp_opt_ins
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
