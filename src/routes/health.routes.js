import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { getQueueStats } from '../services/messageService.js';
import { getLimitStatus } from '../services/rateLimitService.js';
import { getWhatsAppStatus } from '../whatsapp/client.js';

export const healthRoutes = Router();

healthRoutes.get('/health', async (req, res) => {
  res.json({
    ok: true,
    app: config.appName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

healthRoutes.get('/status', async (req, res, next) => {
  try {
    const limits = await getLimitStatus();

    res.json({
      ok: true,
      whatsapp: getWhatsAppStatus(),
      queue: await getQueueStats(),
      limits: {
        dailyLimit: limits.dailyLimit,
        sentToday: limits.sentToday,
        remainingToday: limits.remainingToday,
        perPhoneDailyLimit: limits.perPhoneDailyLimit,
        officeHours: limits.officeHours,
        timezone: limits.timezone
      }
    });
  } catch (error) {
    next(error);
  }
});

healthRoutes.get('/health/db', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: 'unavailable',
      error: error.message
    });
  }
});
