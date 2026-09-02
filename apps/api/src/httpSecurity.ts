import type { NextFunction, Request, Response } from "express";

const developmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173"
];

export const allowedBrowserOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? (process.env.NODE_ENV === "production" ? "" : developmentOrigins.join(",")))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

export const isAllowedBrowserOrigin = (origin: string | undefined): boolean =>
  !origin || allowedBrowserOrigins.has(origin);

export const requireTrustedBrowserOrigin = (request: Request, response: Response, next: NextFunction): void => {
  if (!isAllowedBrowserOrigin(request.get("origin"))) {
    response.status(403).json({ error: "This local research action is not available to the requesting origin." });
    return;
  }
  next();
};

type RateLimitOptions = { windowMs: number; maximumRequests: number; message: string };

export const createFixedWindowRateLimiter = ({ windowMs, maximumRequests, message }: RateLimitOptions) => {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || "local-client";
    const current = windows.get(key);
    const windowState = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;
    windowState.count += 1;
    windows.set(key, windowState);
    if (windows.size > 256) {
      for (const [candidate, state] of windows) if (now - state.startedAt >= windowMs) windows.delete(candidate);
    }
    response.setHeader("RateLimit-Limit", maximumRequests.toString());
    response.setHeader("RateLimit-Remaining", Math.max(0, maximumRequests - windowState.count).toString());
    if (windowState.count > maximumRequests) {
      response.setHeader("Retry-After", Math.ceil((windowMs - (now - windowState.startedAt)) / 1000).toString());
      response.status(429).json({ error: message });
      return;
    }
    next();
  };
};
