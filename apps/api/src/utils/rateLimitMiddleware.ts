import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors.js";
import { SlidingWindowRateLimiter, registerLimiter } from "./rateLimiter.js";

type GuardOptions = {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
};

export function createRateLimitGuard(options: GuardOptions) {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: options.windowMs,
    max: options.max
  });
  registerLimiter(limiter);

  const middleware = (req: Request, _res: Response, next: NextFunction) => {
    // req.ip honours the `trust proxy` setting; the raw header is client-controlled.
    const key = (options.key ? options.key(req) : undefined) ?? req.ip ?? "unknown";
    if (!limiter.allow(key)) {
      return next(new AppError("RATE_LIMITED", 429, "Too many requests"));
    }
    return next();
  };

  return { middleware, reset: () => limiter.reset() };
}
