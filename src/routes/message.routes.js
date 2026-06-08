import { Router } from 'express';
import {
  cancelMessage,
  enqueueMessage,
  getMessages,
  getQueueMessage,
  getQueueStats
} from '../services/messageService.js';
import { getLimitStatus } from '../services/rateLimitService.js';
import { sendWhatsAppMessage } from '../whatsapp/client.js';

export const messageRoutes = Router();

messageRoutes.get('/', async (req, res, next) => {
  try {
    const messages = await getMessages({
      status: req.query.status,
      limit: req.query.limit
    });
    res.json({ ok: true, messages });
  } catch (error) {
    next(error);
  }
});

messageRoutes.get('/stats', async (req, res, next) => {
  try {
    res.json({ ok: true, stats: await getQueueStats() });
  } catch (error) {
    next(error);
  }
});

messageRoutes.get('/limits', async (req, res, next) => {
  try {
    res.json({
      ok: true,
      limits: await getLimitStatus()
    });
  } catch (error) {
    next(error);
  }
});

messageRoutes.get('/:id', async (req, res, next) => {
  try {
    const message = await getQueueMessage(req.params.id);

    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    return res.json({ ok: true, message });
  } catch (error) {
    return next(error);
  }
});

messageRoutes.post('/enqueue', async (req, res, next) => {
  try {
    const message = await enqueueMessage(req.body);
    return res.status(201).json({ ok: true, message });
  } catch (error) {
    return next(error);
  }
});

messageRoutes.post('/send-test', async (req, res, next) => {
  try {
    const { recipient_phone, message_text } = req.body;

    if (!recipient_phone || !message_text) {
      return res.status(400).json({
        ok: false,
        error: 'recipient_phone and message_text are required'
      });
    }

    const result = await sendWhatsAppMessage(recipient_phone, message_text);
    return res.json({ ok: true, result });
  } catch (error) {
    return next(error);
  }
});

messageRoutes.post('/:id/cancel', async (req, res, next) => {
  try {
    const message = await cancelMessage(req.params.id);

    if (!message) {
      return res.status(404).json({
        ok: false,
        error: 'Message not found or cannot be cancelled'
      });
    }

    return res.json({ ok: true, message });
  } catch (error) {
    return next(error);
  }
});
