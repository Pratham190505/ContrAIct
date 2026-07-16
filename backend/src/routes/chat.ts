import { Router } from "express";
import axios from "axios";
import { z } from "zod";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ok, fail } from "../utils/response";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
});

// ── GET /api/contracts/:id/chat ─────────────────────────────────────────────
// Fetch full chat history for a contract
router.get("/", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    const messages = await prisma.chatMessage.findMany({
      where: { contractId: req.params.id },
      orderBy: { createdAt: "asc" },
    });

    return ok(res, messages.map((m) => ({
      role: m.role,
      text: m.text,
      cites: m.cites,
      confidence: m.confidence,
      attempts: m.attempts,
      grounded: m.grounded,
    })));
  } catch (err) {
    console.error("[chat/history]", err);
    return fail(res, "Failed to fetch chat history", 500);
  }
});

// ── POST /api/contracts/:id/chat ────────────────────────────────────────────
// Send a message → Self-Healing RAG → return answer
router.post("/", async (req: AuthRequest, res) => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, "Validation failed", 400, parsed.error.flatten());
  }

  const { message } = parsed.data;

  try {
    // Verify ownership + contract is analyzed
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);
    if (contract.status !== "ANALYZED") {
      return fail(res, "Contract is still being analyzed", 422);
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        contractId: req.params.id,
        role: "user",
        text: message,
      },
    });

    // Call Self-Healing RAG via AI service
    const aiRes = await axios.post(`${AI_SERVICE}/chat`, {
      contractId: req.params.id,
      question: message,
    });

    const {
      answer,
      cites = [],
      confidence = null,
      attempts = 0,
      grounded = true,
    } = aiRes.data;

    // Save assistant message with RAG metadata
    const assistantMsg = await prisma.chatMessage.create({
      data: {
        contractId: req.params.id,
        role: "assistant",
        text: answer,
        cites,
        confidence,
        attempts,
        grounded,
      },
    });

    return ok(res, {
      role: assistantMsg.role,
      text: assistantMsg.text,
      cites: assistantMsg.cites,
      confidence: assistantMsg.confidence,
      attempts: assistantMsg.attempts,
      grounded: assistantMsg.grounded,
    });
  } catch (err) {
    console.error("[chat/send]", err);
    return fail(res, "Failed to get answer", 500);
  }
});

// ── DELETE /api/contracts/:id/chat ──────────────────────────────────────────
// Clear chat history
router.delete("/", async (req: AuthRequest, res) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!contract) return fail(res, "Contract not found", 404);

    await prisma.chatMessage.deleteMany({
      where: { contractId: req.params.id },
    });

    return ok(res, { cleared: true });
  } catch (err) {
    console.error("[chat/clear]", err);
    return fail(res, "Failed to clear chat", 500);
  }
});

export default router;
