import { Router } from 'express';
import { getLatestQr, getWhatsAppStatus, startWhatsAppClient } from '../whatsapp/client.js';

export const qrRoutes = Router();

qrRoutes.get('/', (req, res) => {
  const qr = getLatestQr();
  const status = getWhatsAppStatus();

  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="5">
    <title>SmartBooks WhatsApp QR</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
      pre { white-space: pre-wrap; word-break: break-all; background: #f4f4f5; padding: 1rem; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h1>SmartBooks WhatsApp QR</h1>
    <p>Status: <strong>${status.state}</strong></p>
    <p>Connected: <strong>${status.connected ? 'yes' : 'no'}</strong></p>
    ${
      qr
        ? '<p>Scan the QR from Railway logs or use the QR payload below with your internal tooling.</p><pre>' +
          qr +
          '</pre>'
        : '<p>No QR is currently available. If not connected, check Railway logs and restart the worker.</p>'
    }
  </body>
</html>`);
});

qrRoutes.get('/json', (req, res) => {
  const status = getWhatsAppStatus();

  res.json({
    connected: status.connected,
    qrAvailable: status.qrAvailable,
    qr: getLatestQr()
  });
});

qrRoutes.post('/restart', async (req, res, next) => {
  try {
    await startWhatsAppClient();
    res.json({
      ok: true,
      whatsapp: getWhatsAppStatus()
    });
  } catch (error) {
    next(error);
  }
});
