import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";

// ── Route imports ───────────────────────────────────────────────────────────
import authRoutes     from "./routes/auth";
import contractRoutes from "./routes/contracts";
import clauseRoutes   from "./routes/clauses";
import analysisRoutes from "./routes/analysis";
import chatRoutes     from "./routes/chat";
import compareRoutes  from "./routes/compare";
import reportRoutes   from "./routes/reports";

const app  = express();
const PORT = process.env.PORT ?? 5000;
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173,http://localhost:8080")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// ── Security middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// ── Rate limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,                    // max 100 requests per window
  message: { success: false, error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ── General middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Static uploads (dev only — use object storage in prod) ─────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ContrAIct API",
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth",                          authRoutes);
app.use("/api/contracts",                     contractRoutes);
app.use("/api/contracts/:id/clauses",         clauseRoutes);
app.use("/api/contracts/:id/analysis",        analysisRoutes);
app.use("/api/contracts/:id/chat",            chatRoutes);
app.use("/api/contracts/:id/report",          reportRoutes);
app.use("/api/compare",                       compareRoutes);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server error]", err);
  res.status(500).json({ success: false, error: err.message ?? "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║       ContrAIct API — Running         ║
  ║  http://localhost:${PORT}             ║
  ║  ENV: ${process.env.NODE_ENV ?? "development"}                  ║
  ╚═══════════════════════════════════════╝
  `);
});

export default app;
