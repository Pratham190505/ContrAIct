import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ok, fail } from "../utils/response";

const router = Router();
router.use(requireAuth);

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

const CompareSchema = z.object({
  contractIdA: z.string().uuid(),
  contractIdB: z.string().uuid(),
});

// ── POST /api/compare ────────────────────────────────────────────────────────
// Sends two contracts to AI service → returns clause-level diff
router.post("/", async (req: AuthRequest, res) => {
  const parsed = CompareSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, "Validation failed", 400, parsed.error.flatten());
  }

  const { contractIdA, contractIdB } = parsed.data;

  try {
    // Verify both contracts belong to user
    const [contractA, contractB] = await Promise.all([
      prisma.contract.findFirst({
        where: { id: contractIdA, userId: req.userId! },
        include: { clauses: true },
      }),
      prisma.contract.findFirst({
        where: { id: contractIdB, userId: req.userId! },
        include: { clauses: true },
      }),
    ]);

    if (!contractA) return fail(res, "Contract A not found", 404);
    if (!contractB) return fail(res, "Contract B not found", 404);

    // Call AI service for semantic diff
    const aiRes = await axios.post(`${AI_SERVICE}/compare`, {
      contractIdA,
      contractIdB,
      rawTextA: contractA.rawText,
      rawTextB: contractB.rawText,
    });

    return ok(res, {
      contractA: { id: contractA.id, name: contractA.name },
      contractB: { id: contractB.id, name: contractB.name },
      diff: aiRes.data.diff,         // [{ kind, text }] array — same shape as frontend versionA/B
      summary: aiRes.data.summary,
    });
  } catch (err) {
    console.error("[compare]", err);
    return fail(res, "Comparison failed", 500);
  }
});

export default router;
