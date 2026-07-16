import { Router } from "express";
import path from "path";
import axios from "axios";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { mapContract } from "../utils/contractMapper";
import { ok, fail } from "../utils/response";

const router = Router();
router.use(requireAuth);

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

// ── GET /api/contracts ──────────────────────────────────────────────────────
// Returns all contracts for the authenticated user (list view)
router.get("/", async (req: AuthRequest, res) => {
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

// ── GET /api/contracts/:id ──────────────────────────────────────────────────
// Full contract detail — replaces getContract(id) mock
router.get("/:id", async (req: AuthRequest, res) => {
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

// ── POST /api/contracts/upload ──────────────────────────────────────────────
// Accepts file → saves to disk → triggers AI service → returns contract
router.post(
  "/upload",
  upload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      return fail(res, "No file uploaded", 400);
    }

    const { originalname, path: filePath, size, mimetype } = req.file;

    try {
      // 1 — Create contract record with PROCESSING status
      const contract = await prisma.contract.create({
        data: {
          userId: req.userId!,
          name: originalname,
          type: "Unknown",            // AI service will classify
          party: "Unknown",           // AI service will extract
          filePath,
          fileSize: size,
          mimeType: mimetype,
          status: "PROCESSING",
        },
        include: { clauses: true, obligations: true, dates: true },
      });

      // 2 — Trigger AI service asynchronously
      //     The AI service calls back PATCH /api/contracts/:id/analysis when done
      triggerAnalysis(contract.id, filePath, mimetype).catch((err) => {
        console.error("[contracts/upload] AI trigger failed:", err.message);
        prisma.contract
          .update({ where: { id: contract.id }, data: { status: "FAILED" } })
          .catch(console.error);
      });

      // 3 — Return immediately with processing status
      return ok(res, mapContract(contract), 202);
    } catch (err) {
      console.error("[contracts/upload]", err);
      return fail(res, "Upload failed", 500);
    }
  }
);

// ── PATCH /api/contracts/:id/analysis ──────────────────────────────────────
// Called by AI service when analysis is complete — saves results to DB
router.patch("/:id/analysis", async (req: AuthRequest, res) => {
  const {
    type, party, pages, riskScore, confidence,
    summary, missing, negotiation, rawText,
    clauses, obligations, dates,
  } = req.body;

  try {
    // Verify contract belongs to user
    const existing = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) return fail(res, "Contract not found", 404);

    // Upsert all related data in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update contract fields
      await tx.contract.update({
        where: { id: req.params.id },
        data: {
          type, party, pages, riskScore, confidence,
          summary, missing, negotiation, rawText,
          status: "ANALYZED",
          analyzedAt: new Date(),
        },
      });

      // Replace clauses
      await tx.clause.deleteMany({ where: { contractId: req.params.id } });
      if (clauses?.length) {
        await tx.clause.createMany({
          data: clauses.map((c: any) => ({ ...c, contractId: req.params.id })),
        });
      }

      // Replace obligations
      await tx.obligation.deleteMany({ where: { contractId: req.params.id } });
      if (obligations?.length) {
        await tx.obligation.createMany({
          data: obligations.map((o: any) => ({ ...o, contractId: req.params.id })),
        });
      }

      // Replace dates
      await tx.contractDate.deleteMany({ where: { contractId: req.params.id } });
      if (dates?.length) {
        await tx.contractDate.createMany({
          data: dates.map((d: any) => ({ ...d, contractId: req.params.id })),
        });
      }

      return tx.contract.findFirst({
        where: { id: req.params.id },
        include: { clauses: true, obligations: true, dates: true },
      });
    });

    return ok(res, mapContract(updated!));
  } catch (err) {
    console.error("[contracts/analysis]", err);
    return fail(res, "Failed to save analysis", 500);
  }
});

// ── DELETE /api/contracts/:id ───────────────────────────────────────────────
router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    await prisma.contract.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  } catch (err) {
    console.error("[contracts/delete]", err);
    return fail(res, "Delete failed", 500);
  }
});

// ── Internal: fire-and-forget AI trigger ────────────────────────────────────
async function triggerAnalysis(contractId: string, filePath: string, mimeType: string) {
  await axios.post(`${AI_SERVICE}/analyze`, {
    contractId,
    filePath: path.resolve(filePath),
    mimeType,
    callbackUrl: `${process.env.BACKEND_URL ?? "http://localhost:5000"}/api/contracts/${contractId}/analysis`,
  });
}

export default router;
