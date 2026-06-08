import { config } from "../config.js";

export function apiKeyMiddleware(req, res, next) {
  const publicPaths = ["/health", "/status"];

  if (publicPaths.includes(req.path)) {
    return next();
  }

  // Allow QR page using query key in browser
  if (req.path === "/qr" || req.path === "/qr/json") {
    const queryKey = req.query.key;
    const headerKey = req.headers["x-api-key"];

    if (queryKey === config.apiKey || headerKey === config.apiKey) {
      return next();
    }

    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      message: "Open /qr?key=YOUR_API_KEY",
    });
  }

  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  next();
}