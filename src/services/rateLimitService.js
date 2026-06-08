import { config } from '../config.js';
import { query } from '../db/pool.js';
import { cleanPhone } from '../whatsapp/phone.js';

const ALLOWED_WITHOUT_OPT_IN = new Set([
  'FEE_PAYMENT_RECEIPT',
  'PAYMENT_SUCCESS',
  'ADMISSION_CONFIRMATION'
]);

export async function canSendMessage(queueMessage) {
  const currentTime = getLocalTimeParts();

  if (isOutsideOfficeHours(currentTime)) {
    return {
      allowed: false,
      reason: 'OUTSIDE_OFFICE_HOURS',
      rescheduleTomorrow: false
    };
  }

  const sentToday = await getSentTodayCount();
  if (sentToday >= config.dailyMessageLimit) {
    return {
      allowed: false,
      reason: 'DAILY_LIMIT_REACHED',
      rescheduleTomorrow: true
    };
  }

  const perPhoneSentToday = await getSentTodayCount(queueMessage.recipient_phone);
  if (perPhoneSentToday >= config.perPhoneDailyLimit) {
    return {
      allowed: false,
      reason: 'PER_PHONE_DAILY_LIMIT_REACHED',
      rescheduleTomorrow: true
    };
  }

  const latestSentAt = await getLatestSentAt();
  if (latestSentAt) {
    const elapsedMs = Date.now() - new Date(latestSentAt).getTime();

    if (elapsedMs < config.minGapBetweenMessagesMs) {
      return {
        allowed: false,
        reason: 'MIN_GAP_NOT_COMPLETED',
        rescheduleTomorrow: false
      };
    }
  }

  const optIn = await getOptIn(queueMessage.recipient_phone);
  if (optIn && optIn.is_opted_in === false) {
    return {
      allowed: false,
      reason: 'USER_OPTED_OUT',
      cancel: true
    };
  }

  if (!optIn && !ALLOWED_WITHOUT_OPT_IN.has(String(queueMessage.message_type || '').toUpperCase())) {
    return {
      allowed: false,
      reason: 'OPT_IN_REQUIRED',
      cancel: true
    };
  }

  return { allowed: true };
}

export async function rescheduleMessage(queueId, reason) {
  const nextSendTime = getNextAllowedSendTime(reason);

  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = 'PENDING',
         scheduled_at = $2,
         locked_at = NULL,
         processing_started_at = NULL,
         error_message = $3
     WHERE id = $1
     RETURNING *`,
    [queueId, nextSendTime, reason]
  );

  return result.rows[0] || null;
}

export async function markSkippedOrDelayed(queueId, reason) {
  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = 'PENDING',
         scheduled_at = $2,
         locked_at = NULL,
         processing_started_at = NULL,
         error_message = $3
     WHERE id = $1
     RETURNING *`,
    [queueId, getNextAllowedSendTime(reason), reason]
  );

  return result.rows[0] || null;
}

export async function cancelMessageForSafety(message, reason) {
  const result = await query(
    `UPDATE whatsapp_message_queue
     SET status = 'CANCELLED',
         cancelled_at = CURRENT_TIMESTAMP,
         locked_at = NULL,
         processing_started_at = NULL,
         error_message = $2
     WHERE id = $1
     RETURNING *`,
    [message.id, reason]
  );

  const updated = result.rows[0] || message;
  await insertSafetyLog(updated, 'CANCELLED', reason);

  return updated;
}

export function getNextAllowedSendTime(reason) {
  const now = new Date();

  if (reason === 'MIN_GAP_NOT_COMPLETED') {
    return new Date(now.getTime() + 2 * 60 * 1000);
  }

  const parts = getLocalTimeParts(now);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;
  let hour = config.rescheduleHour;

  if (reason === 'OUTSIDE_OFFICE_HOURS') {
    hour = config.sendingStartHour;

    if (parts.hour >= config.sendingStartHour) {
      ({ year, month, day } = addLocalDays(parts, 1));
    }
  } else {
    ({ year, month, day } = addLocalDays(parts, 1));
  }

  return makeDateInTimeZone(year, month, day, hour, 0, 0, config.timezone);
}

export async function getLimitStatus() {
  const [sentToday, pendingCount, failedCount, cancelledCount] = await Promise.all([
    getSentTodayCount(),
    getQueueCountByStatus('PENDING'),
    getQueueCountByStatus('FAILED'),
    getQueueCountByStatus('CANCELLED')
  ]);

  return {
    dailyLimit: config.dailyMessageLimit,
    sentToday,
    remainingToday: Math.max(config.dailyMessageLimit - sentToday, 0),
    perPhoneDailyLimit: config.perPhoneDailyLimit,
    pendingCount,
    failedCount,
    cancelledCount,
    officeHours: {
      startHour: config.sendingStartHour,
      endHour: config.sendingEndHour
    },
    timezone: config.timezone,
    nextAllowedSendingWindow: getNextSendingWindow()
  };
}

async function getSentTodayCount(phone) {
  const params = [];
  let phoneFilter = '';

  if (phone) {
    params.push(phone);
    phoneFilter = ` AND recipient_phone = $${params.length}`;
  }

  const result = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM whatsapp_message_logs
     WHERE status = 'SENT'
       AND DATE(created_at) = CURRENT_DATE${phoneFilter}`,
    params
  );

  return result.rows[0]?.count || 0;
}

async function getQueueCountByStatus(status) {
  const result = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM whatsapp_message_queue
     WHERE status = $1`,
    [status]
  );

  return result.rows[0]?.count || 0;
}

async function getLatestSentAt() {
  const result = await query(
    `SELECT sent_at
     FROM whatsapp_message_logs
     WHERE status = 'SENT'
     ORDER BY sent_at DESC NULLS LAST, created_at DESC
     LIMIT 1`
  );

  return result.rows[0]?.sent_at || null;
}

async function getOptIn(phone) {
  const cleanedPhone = cleanPhone(phone);
  const alternatePhone = cleanedPhone.length === 10 ? `91${cleanedPhone}` : cleanedPhone.replace(/^91/, '');

  const result = await query(
    `SELECT is_opted_in
     FROM whatsapp_opt_ins
     WHERE phone IN ($1, $2)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [cleanedPhone, alternatePhone]
  );

  return result.rows[0] || null;
}

async function insertSafetyLog(message, status, errorMessage) {
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
      error_message
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
      errorMessage
    ]
  );
}

function getLocalTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = Number(part.value);
    return acc;
  }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function getNextSendingWindow() {
  const now = new Date();
  const parts = getLocalTimeParts(now);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;
  let startsAt = now;

  if (parts.hour < config.sendingStartHour) {
    startsAt = makeDateInTimeZone(year, month, day, config.sendingStartHour, 0, 0, config.timezone);
  } else if (isAfterOfficeHours(parts)) {
    ({ year, month, day } = addLocalDays(parts, 1));
    startsAt = makeDateInTimeZone(year, month, day, config.sendingStartHour, 0, 0, config.timezone);
  }

  const endsAt = makeDateInTimeZone(year, month, day, config.sendingEndHour, 0, 0, config.timezone);

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString()
  };
}

function isOutsideOfficeHours(parts) {
  return parts.hour < config.sendingStartHour || isAfterOfficeHours(parts);
}

function isAfterOfficeHours(parts) {
  return parts.hour > config.sendingEndHour || (parts.hour === config.sendingEndHour && parts.minute > 0);
}

function addLocalDays(parts, days) {
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));

  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate()
  };
}

function makeDateInTimeZone(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMs);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = parts.reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = Number(part.value);
    return acc;
  }, {});

  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return asUtc - date.getTime();
}
