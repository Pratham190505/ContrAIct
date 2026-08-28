import { Router } from "express";
import path from "path";
import axios from "axios";
import fs from "fs/promises";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireAIService } from "../middleware/requireAIService";
import { upload } from "../middleware/upload";
import { logger } from "../config/logger";
import { mapContract } from "../utils/contractMapper";
import { ok, fail } from "../utils/response";
import { deleteContractEverywhere } from "../services/contractDeletionService";

const router = Router();

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

const RiskLevelSchema = z.enum(["low", "medium", "high"]);
const DateKindSchema = z.enum(["renewal", "expiry", "payment", "review"]);

const ClauseSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  category: z.string().min(1),
  original: z.string().min(1),
  plain: z.string().min(1),
  risk: RiskLevelSchema,
  reason: z.string().min(1),
  consequences: z.string().min(1),
  negotiation: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const ObligationSchema = z.object({
  party: z.string().min(1),
  obligation: z.string().min(1),
  due: z.string().optional(),
});

const DateSchema = z.object({
  label: z.string().min(1),
  date: z.string().min(1),
  kind: DateKindSchema,
});

const StringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.trim() ? [value] : [];
  return value;
}, z.array(z.string()).default([]));

const AnalysisCallbackSchema = z.object({
  type: z.string().min(1),
  party: z.string().min(1),
  pages: z.number().int().min(0),
  riskScore: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  missing: StringArraySchema,
  negotiation: StringArraySchema,
  rawText: z.string(),
  clauses: z.array(ClauseSchema).default([]),
  obligations: z.array(ObligationSchema).default([]),
  dates: z.array(DateSchema).default([]),
});

const FailedCallbackSchema = z.object({
  status: z.literal("FAILED"),
  error: z.string().min(1),
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const contracts = await prisma.contract.findMany({
      where: { userId: req.userId! },
      include: { clauses: true, obligations: true, dates: true },
      orderBy: { uploadedAt: "desc" },
    });

    return ok(res, contracts.map(mapContract));
  } catch (err) {
    console.error("[contracts/list]", err);
    return fail(res, "Failed to fetch contracts", 500);
  }
});

router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      return fail(res, "No file uploaded", 400);
    }

    const { originalname, path: filePath, size, mimetype } = req.file;

    try {
      const fileHash = await computeFileHash(filePath);
      logger.info("[UPLOAD]", { userId: req.userId, filename: originalname, mimeType: mimetype, size, fileHash });

      const duplicate = await prisma.contract.findFirst({
        where: {
          userId: req.userId!,
          fileHash,
        } as any,
        include: { clauses: true, obligations: true, dates: true },
        orderBy: { uploadedAt: "desc" },
      });

      if (duplicate) {
        await fs.unlink(filePath).catch((unlinkError) => {
          logger.warn("[UPLOAD DUPLICATE CLEANUP]", { filePath, error: unlinkError });
        });
        logger.info("[UPLOAD DEDUPED]", { contractId: duplicate.id, fileHash, status: duplicate.status });
        return ok(res, mapContract(duplicate), duplicate.status === "PROCESSING" ? 202 : 200);
      }

      const contract = await prisma.contract.create({
        data: {
          userId: req.userId!,
          name: originalname,
          type: "Unknown",
          party: "Unknown",
          filePath,
          fileHash,
          fileSize: size,
          mimeType: mimetype,
          status: "PROCESSING",
        } as any,
        include: { clauses: true, obligations: true, dates: true },
      });

      triggerAnalysis(contract.id, filePath, mimetype, fileHash).catch((err) => {
        const message = err instanceof Error ? err.message : "AI trigger failed";
        logger.error("[AI CALLBACK FAILED]", {
          contractId: contract.id,
          error: message,
          stack: err instanceof Error ? err.stack : undefined,
        });
        prisma.contract
          .update({
            where: { id: contract.id },
            data: { status: "FAILED", failureReason: message } as any,
          })
          .catch((dbErr) => logger.error("[AI CALLBACK FAILED]", { contractId: contract.id, error: dbErr }));
      });

      return ok(res, mapContract(contract), 202);
    } catch (err) {
      logger.error("[UPLOAD]", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
      });
      return fail(res, "Upload failed", 500);
    }
  },
);

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: { clauses: true, obligations: true, dates: true },
    });

    if (!contract) return fail(res, "Contract not found", 404);
    return ok(res, mapContract(contract));
  } catch (err) {
    console.error("[contracts/get]", err);
    return fail(res, "Failed to fetch contract", 500);
  }
});

router.patch("/:id/analysis", requireAIService, async (req, res) => {
  const contractId = req.params.id;

  try {
    logger.info("[AI CALLBACK]", { contractId, callbackUrl: req.originalUrl });

    const existing = await prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!existing) return fail(res, "Contract not found", 404);

    const failedPayload = FailedCallbackSchema.safeParse(req.body);
    if (failedPayload.success) {
      const failed = await prisma.contract.update({
        where: { id: contractId },
        data: {
          status: "FAILED",
          failureReason: failedPayload.data.error,
        } as any,
        include: { clauses: true, obligations: true, dates: true },
      });
      logger.error("[AI CALLBACK FAILED]", {
        contractId,
        error: failedPayload.data.error,
      });
      return ok(res, mapContract(failed));
    }

    const normalizedBody = normalizeAnalysisCallbackInput(req.body, contractId);
    const parsed = AnalysisCallbackSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      const validationErrors = {
        formErrors: flattened.formErrors,
        fieldErrors: flattened.fieldErrors,
        issues: parsed.error.issues,
      };

      logger.error("[AI CALLBACK FAILED]", {
        contractId,
        validationErrors,
      });

      return fail(res, "Invalid analysis callback payload", 400, validationErrors);
    }

    const {
      type, party, pages, riskScore, confidence,
      summary, missing, negotiation, rawText,
      clauses, obligations, dates,
    } = parsed.data;
    const { rawText: _rawText, ...analysisJson } = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          type,
          party,
          pages,
          riskScore,
          confidence,
          summary,
          missing,
          negotiation,
          analysisJson,
          rawText,
          status: "ANALYZED",
          failureReason: null,
          analyzedAt: new Date(),
        } as any,
      });

      await tx.clause.deleteMany({ where: { contractId } });
      if (clauses.length) {
        await tx.clause.createMany({
          data: clauses.map(({ id: _id, ...clause }) => ({ ...clause, contractId })),
        });
      }

      await tx.obligation.deleteMany({ where: { contractId } });
      if (obligations.length) {
        await tx.obligation.createMany({
          data: obligations.map((obligation) => ({ ...obligation, contractId })),
        });
      }

      await tx.contractDate.deleteMany({ where: { contractId } });
      if (dates.length) {
        await tx.contractDate.createMany({
          data: dates.map((date) => ({ ...date, contractId })),
        });
      }

      const savedCounts = {
        clauses: await tx.clause.count({ where: { contractId } }),
        obligations: await tx.obligation.count({ where: { contractId } }),
        dates: await tx.contractDate.count({ where: { contractId } }),
      };

      const savedContract = await tx.contract.findUnique({
        where: { id: contractId },
        include: { clauses: true, obligations: true, dates: true },
      });

      return { savedContract, savedCounts };
    });

    const { savedContract, savedCounts } = updated;

    logger.info("[CONTRACT UPDATED]", {
      contractId,
      status: "ANALYZED",
      clausesSaved: savedCounts.clauses,
      obligationsSaved: savedCounts.obligations,
      datesSaved: savedCounts.dates,
      negotiationTips: negotiation.length,
      missingClauses: missing.length,
    });
    if (obligations.length > 0 && savedCounts.obligations === 0) {
      logger.warn("[AI CALLBACK SAVE WARNING]", { contractId, table: "obligations", expected: obligations.length, saved: 0 });
    }
    if (dates.length > 0 && savedCounts.dates === 0) {
      logger.warn("[AI CALLBACK SAVE WARNING]", { contractId, table: "contract_dates", expected: dates.length, saved: 0 });
    }
    return ok(res, mapContract(savedContract!));
  } catch (err) {
    logger.error("[AI CALLBACK FAILED]", {
      contractId,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(res, "Failed to save analysis", 500);
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const contractId = req.params.id;
  const userId = req.userId!;

  try {
    const result = await deleteContractEverywhere({ contractId, userId });
    if (!result) return fail(res, "Contract not found", 404);
    return ok(res, result);
  } catch (err) {
    logger.error("[contracts/delete]", {
      contractId,
      userId,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(res, "Delete failed", 500);
  }
});

async function computeFileHash(filePath: string) {
  const file = await fs.readFile(filePath);
  return createHash("sha256").update(file).digest("hex");
}

async function triggerAnalysis(contractId: string, filePath: string, mimeType: string, documentHash: string) {
  await axios.post(`${AI_SERVICE}/analyze`, {
    contractId,
    filePath: path.resolve(filePath),
    mimeType,
    documentHash,
    callbackUrl: `${process.env.BACKEND_URL ?? "http://localhost:5000"}/api/contracts/${contractId}/analysis`,
  });
}

function normalizeAnalysisCallbackInput(body: unknown, contractId: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const source = body as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };
  const aliases: Record<string, string[]> = {
    riskScore: ["risk_score", "risk"],
    obligations: ["extractedObligations", "duties"],
    dates: ["contractDates", "timeline", "keyDates"],
    negotiation: ["negotiationTips", "tips"],
    missing: ["missingClauses", "missing_clauses"],
    clauses: ["riskyClauses", "extractedClauses"],
  };

  for (const [canonical, alternatives] of Object.entries(aliases)) {
    if (normalized[canonical] !== undefined) continue;
    const alias = alternatives.find((key) => source[key] !== undefined);
    if (alias) {
      normalized[canonical] = source[alias];
      logger.warn("[AI CALLBACK FIELD ALIAS]", { contractId, expected: canonical, received: alias });
    }
  }

  for (const key of ["obligations", "dates", "negotiation", "missing", "clauses"]) {
    if (normalized[key] === undefined) {
      logger.warn("[AI CALLBACK MISSING FIELD]", { contractId, field: key });
    }
  }

  return normalized;
}

export default router;
