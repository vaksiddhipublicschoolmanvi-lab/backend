import { config } from '../config.js';
import { getClient } from '../db/pool.js';
import { delay, randomDelay } from '../utils/delay.js';
import { logger } from '../utils/logger.js';
import { getWhatsAppStatus } from '../whatsapp/client.js';
import { markMessageFailed, releaseClaimedMessage, sendQueuedMessage } from './messageService.js';
import {
  canSendMessage,
  cancelMessageForSafety,
  markSkippedOrDelayed,
  rescheduleMessage
} from './rateLimitService.js';

let timer = null;
let cycleRunning = false;

export function startQueueWorker() {
  if (!config.workerEnabled) {
    logger.warn('WhatsApp queue worker is disabled by WORKER_ENABLED=false');
    return;
  }

  if (timer) return;

  logger.info(
    {
      pollIntervalMs: config.pollIntervalMs,
      maxMessagesPerCycle: config.maxMessagesPerCycle,
      sendDelayMinMs: config.sendDelayMinMs,
      sendDelayMaxMs: config.sendDelayMaxMs
    },
    'Starting WhatsApp queue worker'
  );

  runCycle().catch((error) => logger.error({ err: error }, 'Initial queue cycle failed'));
  timer = setInterval(() => {
    runCycle().catch((error) => logger.error({ err: error }, 'Queue cycle failed'));
  }, config.pollIntervalMs);
}

export function stopQueueWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function getQueueWorkerStatus() {
  return {
    enabled: config.workerEnabled,
    running: Boolean(timer),
    cycleRunning,
    pollIntervalMs: config.pollIntervalMs,
    maxMessagesPerCycle: config.maxMessagesPerCycle
  };
}

async function runCycle() {
  if (cycleRunning) return;

  const whatsappStatus = getWhatsAppStatus();
  if (!whatsappStatus.connected) {
    logger.debug({ whatsappStatus }, 'Skipping queue cycle because WhatsApp is not connected');
    return;
  }

  cycleRunning = true;

  try {
    const messages = await claimPendingMessages(config.maxMessagesPerCycle);

    if (messages.length === 0) return;

    logger.info({ count: messages.length }, 'Claimed WhatsApp messages from queue');

    for (const message of messages) {
      const safety = await canSendMessage(message);

      if (!safety.allowed) {
        if (safety.cancel) {
          await cancelMessageForSafety(message, safety.reason);
          logger.warn({ queueId: message.id, reason: safety.reason }, 'Cancelled WhatsApp message by safety controls');
          continue;
        }

        if (safety.rescheduleTomorrow || safety.reason === 'OUTSIDE_OFFICE_HOURS') {
          const updated = await rescheduleMessage(message.id, safety.reason);
          logger.info(
            { queueId: message.id, reason: safety.reason, scheduledAt: updated?.scheduled_at },
            'Rescheduled WhatsApp message by safety controls'
          );
          continue;
        }

        if (safety.reason === 'MIN_GAP_NOT_COMPLETED') {
          const updated = await markSkippedOrDelayed(message.id, safety.reason);
          logger.info(
            { queueId: message.id, reason: safety.reason, scheduledAt: updated?.scheduled_at },
            'Delayed WhatsApp message by safety controls'
          );
          continue;
        }

        await releaseClaimedMessage(message, safety.reason);
        logger.warn({ queueId: message.id, reason: safety.reason }, 'Released WhatsApp message by safety controls');
        continue;
      }

      const waitMs = randomDelay(config.sendDelayMinMs, config.sendDelayMaxMs);
      logger.info({ queueId: message.id, waitMs }, 'Waiting before sending WhatsApp message');
      await delay(waitMs);

      if (!getWhatsAppStatus().connected) {
        await releaseClaimedMessage(message);
        logger.warn({ queueId: message.id }, 'Released message because WhatsApp disconnected before send');
        continue;
      }

      try {
        const result = await sendQueuedMessage(message);
        logger.info(
          { queueId: message.id, whatsappMessageId: result.whatsappMessageId },
          'WhatsApp message sent'
        );
      } catch (error) {
        const updated = await markMessageFailed(message, error);
        logger.error(
          { err: error, queueId: message.id, status: updated?.status, attempts: updated?.attempts },
          'WhatsApp message send failed'
        );
      }
    }
  } finally {
    cycleRunning = false;
  }
}

async function claimPendingMessages(limit) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `WITH picked AS (
        SELECT id
        FROM whatsapp_message_queue
        WHERE status = 'PENDING'
          AND scheduled_at <= CURRENT_TIMESTAMP
          AND attempts < max_attempts
        ORDER BY priority ASC, scheduled_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE whatsapp_message_queue q
      SET status = 'PROCESSING',
          locked_at = CURRENT_TIMESTAMP,
          processing_started_at = CURRENT_TIMESTAMP,
          error_message = NULL
      FROM picked
      WHERE q.id = picked.id
      RETURNING q.*`,
      [limit]
    );

    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
