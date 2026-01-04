import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors.js";
import { TokenClaims, verifyToken } from "./token.js";

export type AuthedRequest = Request & { auth?: TokenClaims };

export function requireAuth(secret: string) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!token) {
      return next(new AppError("UNAUTHORIZED", 401, "Missing bearer token"));
    }
    try {
      req.auth = verifyToken(token, secret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
