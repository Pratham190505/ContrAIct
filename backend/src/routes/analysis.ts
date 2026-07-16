import { Router } from "express";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { mapContract } from "../utils/contractMapper";
import { ok, fail } from "../utils/response";

const router = Router({ mergeParams: true });
router.use(requireAuth);

// ── GET /api/contracts/:id/analysis ─────────────────────────────────────────
// Returns full analysis — replaces contracts[0] in analysis page
router.get("/", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: { clauses: true, obligations: true, dates: true },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    return ok(res, mapContract(contract));
  } catch (err) {
    console.error("[analysis/get]", err);
    return fail(res, "Failed to fetch analysis", 500);
  }
});

// ── GET /api/contracts/:id/obligations ──────────────────────────────────────
router.get("/obligations", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    const obligations = await prisma.obligation.findMany({
      where: { contractId: req.params.id },
    });

    return ok(res, obligations.map((o) => ({
      party: o.party,
      obligation: o.obligation,
      ...(o.due ? { due: o.due } : {}),
    })));
  } catch (err) {
    console.error("[analysis/obligations]", err);
    return fail(res, "Failed to fetch obligations", 500);
  }
});

// ── GET /api/contracts/:id/timeline ─────────────────────────────────────────
router.get("/timeline", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    const dates = await prisma.contractDate.findMany({
      where: { contractId: req.params.id },
      orderBy: { date: "asc" },
    });

    return ok(res, dates.map((d) => ({
      label: d.label,
      date: d.date,
      kind: d.kind,
    })));
  } catch (err) {
    console.error("[analysis/timeline]", err);
    return fail(res, "Failed to fetch timeline", 500);
  }
});

export default router;
