import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { mkdir, rm } from 'node:fs/promises';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { formatIndianPhoneToJid } from './phone.js';

let socket = null;
let latestQr = null;
let connectionState = 'closed';
let startingPromise = null;
let lastConnectionUpdate = null;
let userInfo = null;

export async function startWhatsApp() {
  if (startingPromise) return startingPromise;

  startingPromise = createClient().finally(() => {
    startingPromise = null;
  });

  return startingPromise;
}

export const startWhatsAppClient = startWhatsApp;

async function createClient() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['SmartBooks AI', 'Chrome', '1.0.0'],
    logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    lastConnectionUpdate = new Date().toISOString();

    if (qr) {
      latestQr = qr;
      connectionState = 'qr';
      logger.info('WhatsApp QR code received. Scan it from your WhatsApp mobile app.');
      qrcode.generate(qr, { small: true });
    }

    if (connection) {
      connectionState = connection;
      logger.info({ connection }, 'WhatsApp connection state changed');
    }

    if (connection === 'open') {
      latestQr = null;
      userInfo = socket?.user || null;
      logger.info('WhatsApp client connected');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      socket = null;
      userInfo = null;

      logger.warn({ statusCode, shouldReconnect }, 'WhatsApp connection closed');

      if (shouldReconnect) {
        setTimeout(() => {
          startWhatsAppClient().catch((error) => {
            logger.error({ err: error }, 'WhatsApp reconnect failed');
          });
        }, 5000);
      } else {
        latestQr = null;
        logger.warn(
          {
            sessionDir: config.sessionDir
          },
          'WhatsApp logged out. Clearing stale session files before requesting a new QR code.'
        );

        try {
          await resetSessionDir();

          setTimeout(() => {
            startWhatsAppClient().catch((error) => {
              logger.error({ err: error }, 'WhatsApp restart after logout failed');
            });
          }, 1000);
        } catch (error) {
          logger.error(
            {
              err: error,
              sessionDir: config.sessionDir
            },
            'Failed to clear WhatsApp session files. Delete the session directory manually and restart.'
          );
        }
      }
    }
  });

  return socket;
}

async function resetSessionDir() {
  await rm(config.sessionDir, { recursive: true, force: true });
  await mkdir(config.sessionDir, { recursive: true });
}

export function getWhatsAppStatus() {
  return {
    connected: connectionState === 'open',
    connecting: connectionState === 'connecting' || connectionState === 'qr',
    state: connectionState,
    lastConnectionUpdate,
    user: userInfo,
    qrAvailable: Boolean(latestQr),
    sessionDir: config.sessionDir
  };
}

export function getLatestQr() {
  return latestQr;
}

export async function sendWhatsAppMessage(phone, messageText) {
  if (!socket || connectionState !== 'open') {
    throw new Error('WhatsApp client is not connected');
  }

  const jid = formatIndianPhoneToJid(phone);
  const result = await socket.sendMessage(jid, { text: messageText });

  return {
    jid,
    whatsappMessageId: result?.key?.id || null,
    raw: result
  };
}
