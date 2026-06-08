import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = ['DATABASE_URL', 'API_KEY'];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function parseNumber(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return parsed;
}

function parseBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

export const config = {
  port: parseNumber('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  apiKey: process.env.API_KEY,
  sessionDir: process.env.SESSION_DIR || './auth_info',
  workerEnabled: parseBoolean('WORKER_ENABLED', true),
  pollIntervalMs: parseNumber('POLL_INTERVAL_MS', 5000),
  sendDelayMinMs: parseNumber('SEND_DELAY_MIN_MS', 45000),
  sendDelayMaxMs: parseNumber('SEND_DELAY_MAX_MS', 120000),
  maxMessagesPerCycle: parseNumber('MAX_MESSAGES_PER_CYCLE', 1),
  maxAttempts: parseNumber('MAX_ATTEMPTS', 3),
  dailyMessageLimit: parseNumber('DAILY_MESSAGE_LIMIT', 25),
  perPhoneDailyLimit: parseNumber('PER_PHONE_DAILY_LIMIT', 1),
  minGapBetweenMessagesMs: parseNumber('MIN_GAP_BETWEEN_MESSAGES_MS', 60000),
  sendingStartHour: parseNumber('SENDING_START_HOUR', 9),
  sendingEndHour: parseNumber('SENDING_END_HOUR', 18),
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  rescheduleHour: parseNumber('RESCHEDULE_HOUR', 9),
  appName: process.env.APP_NAME || 'SmartBooks AI WhatsApp Worker'
};
