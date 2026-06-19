import express from "express";
import { disconnectWhatsApp } from "../whatsapp/client.js";

export const instanceRoutes = express.Router();

instanceRoutes.post("/logout", async (req, res) => {
  try {
    await disconnectWhatsApp();
    res.json({
      ok: true,
      message: "WhatsApp logged out and session cleared successfully",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to logout WhatsApp",
    });
  }
});
