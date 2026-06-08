import express from "express";
import QRCode from "qrcode";
import { getLatestQr, getWhatsAppStatus } from "../whatsapp/client.js";

export const qrRoutes = express.Router();

qrRoutes.get("/", async (req, res) => {
  try {
    const status = getWhatsAppStatus();
    const qr = getLatestQr();

    if (status.connected) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>SmartBooks WhatsApp Connected</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta http-equiv="refresh" content="10" />
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Arial, sans-serif;
                background: #0f172a;
                color: white;
              }
              .card {
                background: #111827;
                padding: 40px;
                border-radius: 24px;
                text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.35);
              }
              .success {
                font-size: 34px;
                font-weight: 800;
                color: #22c55e;
              }
              p {
                color: #cbd5e1;
                font-size: 18px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="success">✅ WhatsApp Connected</div>
              <p>SmartBooks AI WhatsApp worker is ready.</p>
            </div>
          </body>
        </html>
      `);
    }

    if (!qr) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Waiting for WhatsApp QR</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta http-equiv="refresh" content="5" />
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Arial, sans-serif;
                background: #0f172a;
                color: white;
              }
              .card {
                background: #111827;
                padding: 40px;
                border-radius: 24px;
                text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.35);
              }
              p {
                color: #cbd5e1;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Waiting for WhatsApp QR...</h1>
              <p>This page refreshes every 5 seconds.</p>
            </div>
          </body>
        </html>
      `);
    }

    const qrSvg = await QRCode.toString(qr, {
      type: "svg",
      width: 420,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SmartBooks WhatsApp QR</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="refresh" content="30" />
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
              background: #0f172a;
              color: white;
            }
            .card {
              background: #111827;
              padding: 36px;
              border-radius: 24px;
              text-align: center;
              box-shadow: 0 20px 50px rgba(0,0,0,0.35);
              max-width: 560px;
              width: calc(100% - 40px);
            }
            .qr-box {
              background: white;
              padding: 22px;
              border-radius: 18px;
              display: inline-block;
              margin-top: 20px;
            }
            .qr-box svg {
              width: 420px;
              height: 420px;
              max-width: 78vw;
              max-height: 78vw;
              display: block;
            }
            h1 {
              margin: 0;
              font-size: 32px;
            }
            p {
              color: #cbd5e1;
              font-size: 16px;
            }
            .steps {
              margin-top: 16px;
              color: #e5e7eb;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Scan WhatsApp QR</h1>
            <p class="steps">WhatsApp → Linked Devices → Link a Device</p>
            <div class="qr-box">
              ${qrSvg}
            </div>
            <p>This page refreshes automatically every 30 seconds.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("QR page error:", error);
    return res.status(500).send("Failed to generate QR page");
  }
});

qrRoutes.get("/json", (req, res) => {
  const status = getWhatsAppStatus();
  const qr = getLatestQr();

  res.json({
    ok: true,
    connected: status.connected,
    qrAvailable: Boolean(qr),
    qr,
  });
});