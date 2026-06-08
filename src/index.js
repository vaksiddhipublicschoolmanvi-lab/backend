import express from "express";
import cors from "cors";
import helmet from "helmet";

import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { apiKeyAuth } from "./middleware/apiKey.js";

import { healthRoutes } from "./routes/health.routes.js";
import { messageRoutes } from "./routes/message.routes.js";
import { qrRoutes } from "./routes/qr.routes.js";

import { startQueueWorker, stopQueueWorker } from "./services/queueWorker.js";
import { logger } from "./utils/logger.js";
import { startWhatsAppClient } from "./whatsapp/client.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    app: config.appName,
    message: "SmartBooks AI WhatsApp Worker is running",
  });
});

// Public routes
app.use("/", healthRoutes);
app.use("/qr", qrRoutes);

// Protected routes
app.use("/api/messages", apiKeyAuth, messageRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  logger.error(
    {
      err: error,
      path: req.path,
    },
    "Unhandled request error"
  );

  res.status(500).json({
    ok: false,
    error: error.message || "Internal server error",
  });
});

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
    },
    "SmartBooks Baileys worker listening"
  );
});

startWhatsAppClient().catch((error) => {
  logger.error(
    {
      err: error,
    },
    "Failed to start WhatsApp client"
  );
});

startQueueWorker();

async function shutdown(signal) {
  logger.info(
    {
      signal,
    },
    "Shutting down worker"
  );

  stopQueueWorker();

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (error) => {
  logger.error(
    {
      err: error,
    },
    "Unhandled promise rejection"
  );
});

process.on("uncaughtException", (error) => {
  logger.fatal(
    {
      err: error,
    },
    "Uncaught exception"
  );

  process.exit(1);
});