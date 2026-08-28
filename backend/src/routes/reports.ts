import { Router } from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ok, fail } from "../utils/response";
import { deleteContractEverywhere } from "../services/contractDeletionService";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
const REPORTS_DIR = path.resolve(process.cwd(), "reports");

// ── GET /api/contracts/:id/report ────────────────────────────────────────────
// Returns existing report or generates a new one
router.get("/", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        clauses: true,
        obligations: true,
        dates: true,
      },
    });
    if (!contract) return fail(res, "Contract not found", 404);
    if (contract.status !== "ANALYZED") {
      return fail(res, "Contract has not been analyzed yet", 422);
    }

    const storedAnalysis = buildStoredAnalysis(contract);

    // Generate the report from saved analysis so downloads match the app's analysis view.
    const aiRes = await axios.post(
      `${AI_SERVICE}/report`,
      {
        contractId: req.params.id,
        analysis: storedAnalysis,
      },
      { responseType: "arraybuffer" }
    );

    // Save PDF to disk
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const reportPath = path.join(REPORTS_DIR, `${req.params.id}-report.pdf`);
    fs.writeFileSync(reportPath, aiRes.data);

    const existing = await prisma.report.findFirst({
      where: { contractId: req.params.id },
      orderBy: { generatedAt: "desc" },
    });

    if (existing) {
      await prisma.report.update({
        where: { id: existing.id },
        data: {
          filePath: reportPath,
          fileSize: aiRes.data.byteLength,
          generatedAt: new Date(),
        },
      });
    } else {
      await prisma.report.create({
        data: {
          contractId: req.params.id,
          filePath: reportPath,
          fileSize: aiRes.data.byteLength,
        },
      });
    }

    logger.info("[REPORT GENERATED]", {
      contractId: req.params.id,
      filePath: reportPath,
      fileSize: aiRes.data.byteLength,
    });

    return res.download(reportPath, `${contract.name}-report.pdf`);
  } catch (err) {
    console.error("[reports/get]", err);
    return fail(res, "Failed to generate report", 500);
  }
});

// ── DELETE /api/contracts/:id/report ────────────────────────────────────────
// Deletes the same canonical contract graph as the Contracts page.
router.delete("/", async (req: AuthRequest, res) => {
  const contractId = req.params.id;
  const userId = req.userId!;

  try {
    const result = await deleteContractEverywhere({ contractId, userId });
    if (!result) return fail(res, "Contract not found", 404);
    logger.info("[REPORT DELETE CLEANUP SUCCESS]", { contractId, userId });
    return ok(res, result);
  } catch (err) {
    logger.error("[reports/delete]", {
      contractId,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(res, "Failed to delete report", 500);
  }
});

// ── GET /api/reports ─────────────────────────────────────────────────────────
// All reports for the user (for the reports list page)
router.get("/all", async (req: AuthRequest, res) => {
  try {
    const contracts = await prisma.contract.findMany({
      where: { userId: req.userId! },
      include: {
        reports: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });

    const result = contracts
      .filter((c) => c.reports.length > 0)
      .map((c) => ({
        contractId: c.id,
        contractName: c.name,
        generatedAt: c.reports[0].generatedAt.toISOString(),
        fileSize: c.reports[0].fileSize,
      }));

    return ok(res, result);
  } catch (err) {
    console.error("[reports/all]", err);
    return fail(res, "Failed to fetch reports", 500);
  }
});

export default router;

function buildStoredAnalysis(contract: any) {
  const analysisJson = contract.analysisJson && typeof contract.analysisJson === "object"
    ? contract.analysisJson
    : {};

  return {
    ...analysisJson,
    name: contract.name,
    type: analysisJson.type ?? contract.type,
    party: analysisJson.party ?? contract.party,
    pages: analysisJson.pages ?? contract.pages,
    uploadedAt: contract.uploadedAt.toISOString(),
    analyzedAt: contract.analyzedAt?.toISOString() ?? null,
    riskScore: analysisJson.riskScore ?? contract.riskScore,
    confidence: analysisJson.confidence ?? contract.confidence,
    summary: analysisJson.summary ?? contract.summary ?? "",
    clauses: analysisJson.clauses ?? contract.clauses.map((clause: any) => ({
      title: clause.title,
      category: clause.category,
      original: clause.original,
      plain: clause.plain,
      risk: clause.risk,
      reason: clause.reason,
      consequences: clause.consequences,
      negotiation: clause.negotiation,
      confidence: clause.confidence,
    })),
    obligations: analysisJson.obligations ?? contract.obligations.map((obligation: any) => ({
      party: obligation.party,
      obligation: obligation.obligation,
      due: obligation.due,
    })),
    dates: analysisJson.dates ?? contract.dates.map((date: any) => ({
      label: date.label,
      date: date.date,
      kind: date.kind,
    })),
    missing: analysisJson.missing ?? contract.missing,
    negotiation: analysisJson.negotiation ?? contract.negotiation,
  };
}
