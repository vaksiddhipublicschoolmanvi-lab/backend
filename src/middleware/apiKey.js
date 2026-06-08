import { config } from "../config.js";

export function apiKeyAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  next();
}

// Extra export name, so old imports also work
export const apiKeyMiddleware = apiKeyAuth;