import { Router } from "express";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { mapClause } from "../utils/contractMapper";
import { ok, fail } from "../utils/response";

const router = Router({ mergeParams: true });
router.use(requireAuth);

// ── GET /api/contracts/:id/clauses ──────────────────────────────────────────
router.get("/", async (req: AuthRequest, res) => {
  try {
    // Verify ownership
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    const clauses = await prisma.clause.findMany({
      where: { contractId: req.params.id },
    });

    return ok(res, clauses.map(mapClause));
  } catch (err) {
    console.error("[clauses/list]", err);
    return fail(res, "Failed to fetch clauses", 500);
  }
});

// ── GET /api/contracts/:id/clauses/:clauseId ────────────────────────────────
router.get("/:clauseId", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    const clause = await prisma.clause.findFirst({
      where: { id: req.params.clauseId, contractId: req.params.id },
    });
    if (!clause) return fail(res, "Clause not found", 404);

    return ok(res, mapClause(clause));
  } catch (err) {
    console.error("[clauses/get]", err);
    return fail(res, "Failed to fetch clause", 500);
  }
});

export default router;
