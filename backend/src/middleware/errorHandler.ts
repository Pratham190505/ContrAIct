import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";
import { MulterError } from "multer";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(`[Error] ${err.message}`, { stack: err.stack });

  // Multer specific errors
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 20}MB.`,
      });
      return;
    }
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  // Prisma errors
  if (err.message?.includes("Unique constraint")) {
    res.status(409).json({ success: false, message: "Resource already exists." });
    return;
  }

  if (err.message?.includes("Record to update not found")) {
    res.status(404).json({ success: false, message: "Resource not found." });
    return;
  }

  // Default
  const status = (err as { status?: number }).status || 500;
  res.status(status).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
};
