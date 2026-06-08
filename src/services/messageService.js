import { config } from '../config.js';
import { query } from '../db/pool.js';
import { cleanPhone } from '../whatsapp/phone.js';
import { sendWhatsAppMessage } from '../whatsapp/client.js';

export async function enqueueMessage(payload) {
  if (!payload?.recipient_phone) {
    throw new Error('recipient_phone is required');
  }

  if (!payload?.message_text) {
    throw new Error('message_text is required');
  }

  const result = await query(
    `INSERT INTO whatsapp_message_queue (
      organization_id,
      student_id,
      admission_id,
      parent_id,
      recipient_name,
      recipient_phone,
      message_type,
      message_text,
      priority,
      max_attempts,
      scheduled_at,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'GENERAL'), $8, COALESCE($9, 5), COALESCE($10, $11), COALESCE($12, CURRENT_TIMESTAMP), $13)
    RETURNING *`,
    [
      payload.organization_id || null,
      payload.student_id || null,
      payload.admission_id || null,
      payload.parent_id || null,
      payload.recipient_name || null,
      payload.recipient_phone,
      payload.message_type || 'GENERAL',
      payload.message_text,
      payload.priority ?? 5,
      payload.max_attempts || null,
      config.maxAttempts,
      payload.scheduled_at || null,
      payload.created_by || null
    ]
  );

  return result.rows[0];
}

export const createQueueMessage = enqueueMessage;

export async function getQueueMessage(id) {
  const result = await query('SELECT * FROM whatsapp_message_queue WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getMessages({ status, limit } = {}) {
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const params = [];
  const where = [];

  if (status) {
    params.push(String(status).toUpperCase());
    where.push(`status = $${params.length}`);
  }

  params.push(safeLimit);

  const result = await query(
    `SELECT *
     FROM whatsapp_message_queue
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

export const getRecentMessages = (limit = 50) => getMessages({ limit });

export async function cancelMessage(id) {
  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = 'CANCELLED',
         cancelled_at = CURRENT_TIMESTAMP,
         error_message = NULL
     WHERE id = $1
       AND status = 'PENDING'
     RETURNING *`,
    [id]
  );

  return result.rows[0] || null;
}

export const cancelQueueMessage = cancelMessage;

export async function getQueueStats() {
  const result = await query(
    `SELECT status, COUNT(*)::INTEGER AS count
     FROM whatsapp_message_queue
     GROUP BY status
     ORDER BY status`
  );

  return result.rows.reduce((stats, row) => {
    stats[row.status] = row.count;
    return stats;
  }, {});
}

export async function sendQueuedMessage(message) {
  await ensureRecipientIsOptedIn(message.recipient_phone);

  const sendResult = await sendWhatsAppMessage(message.recipient_phone, message.message_text);

  await markMessageSent(message, sendResult.whatsappMessageId);

  return sendResult;
}

export async function markMessageSent(message, whatsappMessageId) {
  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = 'SENT',
         sent_at = CURRENT_TIMESTAMP,
         locked_at = NULL,
         whatsapp_message_id = $2,
         error_message = NULL
     WHERE id = $1
     RETURNING *`,
    [message.id, whatsappMessageId]
  );

  const updated = result.rows[0];
  await createMessageLog(updated || message, 'SENT', whatsappMessageId, null);

  return updated;
}

export async function markMessageFailed(message, error) {
  const errorMessage = error?.message || String(error);
  const nextAttempts = Number(message.attempts) + 1;
  const shouldRetry = nextAttempts < Number(message.max_attempts);
  const status = shouldRetry ? 'PENDING' : 'FAILED';

  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = $2,
         attempts = attempts + 1,
         locked_at = NULL,
         failed_at = CASE WHEN $2 = 'FAILED' THEN CURRENT_TIMESTAMP ELSE failed_at END,
         error_message = $3
     WHERE id = $1
     RETURNING *`,
    [message.id, status, errorMessage]
  );

  const updated = result.rows[0];
  await createMessageLog(updated || message, 'FAILED', null, errorMessage);

  return updated;
}

export async function releaseClaimedMessage(message, reason = 'WhatsApp is not connected') {
  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = 'PENDING',
         locked_at = NULL,
         error_message = $2
     WHERE id = $1
       AND status = 'PROCESSING'
     RETURNING *`,
    [message.id, reason]
  );

  return result.rows[0] || null;
}

async function ensureRecipientIsOptedIn(phone) {
  const cleanedPhone = cleanPhone(phone);
  const result = await query(
    `SELECT is_opted_in
     FROM whatsapp_opt_ins
     WHERE phone IN ($1, $2)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [cleanedPhone, cleanedPhone.length === 10 ? `91${cleanedPhone}` : cleanedPhone.replace(/^91/, '')]
  );

  if (result.rows[0]?.is_opted_in === false) {
    throw new Error(`Recipient ${phone} has opted out of WhatsApp messages`);
  }
}

async function createMessageLog(message, status, whatsappMessageId, errorMessage) {
  await query(
    `INSERT INTO whatsapp_message_logs (
      queue_id,
      organization_id,
      student_id,
      admission_id,
      parent_id,
      recipient_name,
      recipient_phone,
      message_type,
      message_text,
      status,
      whatsapp_message_id,
      error_message,
      sent_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $10 = 'SENT' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    [
      message.id,
      message.organization_id,
      message.student_id,
      message.admission_id,
      message.parent_id,
      message.recipient_name,
      message.recipient_phone,
      message.message_type,
      message.message_text,
      status,
      whatsappMessageId,
      errorMessage
    ]
  );
}
