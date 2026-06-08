import { config } from '../config.js';

export function apiKeyAuth(req, res, next) {
  const apiKey = req.header('x-api-key') || req.query.api_key;

  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  return next();
}
