import { Router } from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ok, fail } from "../utils/response";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

// ── GET /api/contracts/:id/report ────────────────────────────────────────────
// Returns existing report or generates a new one
router.get("/", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);
    if (contract.status !== "ANALYZED") {
      return fail(res, "Contract has not been analyzed yet", 422);
    }

    // Check if report already exists
    const existing = await prisma.report.findFirst({
      where: { contractId: req.params.id },
      orderBy: { generatedAt: "desc" },
    });

    if (existing && fs.existsSync(existing.filePath)) {
      return res.download(existing.filePath, `${contract.name}-report.pdf`);
    }

    // Generate new report via AI service
    const aiRes = await axios.post(
      `${AI_SERVICE}/report`,
      { contractId: req.params.id },
      { responseType: "arraybuffer" }
    );

    // Save PDF to disk
    const reportsDir = "reports";
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const reportPath = path.join(reportsDir, `${req.params.id}-report.pdf`);
    fs.writeFileSync(reportPath, aiRes.data);

    await prisma.report.create({
      data: {
        contractId: req.params.id,
        filePath: reportPath,
        fileSize: aiRes.data.byteLength,
      },
    });

    return res.download(reportPath, `${contract.name}-report.pdf`);
  } catch (err) {
    console.error("[reports/get]", err);
    return fail(res, "Failed to generate report", 500);
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
