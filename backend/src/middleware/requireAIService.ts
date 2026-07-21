import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { fail } from "../utils/response";

function secretsMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireAIService(req: Request, res: Response, next: NextFunction): void {
  const configuredSecret = process.env.AI_SERVICE_SECRET;
  const providedSecret = req.get("x-ai-secret");

  if (!configuredSecret) {
    fail(res, "AI service authentication is not configured", 500);
    return 
  }

  if (!providedSecret || !secretsMatch(providedSecret, configuredSecret)) {
    fail(res, "Unauthorized AI service request", 401);
    return 
  }

  next();
}