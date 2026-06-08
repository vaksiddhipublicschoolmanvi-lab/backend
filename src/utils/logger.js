import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    app: config.appName,
    env: config.nodeEnv
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
