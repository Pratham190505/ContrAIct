import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { fail } from "../utils/response";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    fail(res, "Not authenticated", 401);
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    fail(res, "Authentication is not configured", 500);
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JWTPayload;

    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    fail(res, "Invalid or expired token", 401);
  }
}
