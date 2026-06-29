import { motion } from "framer-motion";

export function RiskGauge({ score, size = 180 }: { score: number; size?: number }) {
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "var(--color-destructive)" : score >= 40 ? "var(--color-warning)" : "var(--color-success)";
  const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--color-muted)"
          strokeWidth={12}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold">{score}</span>
        <span className="text-xs text-muted-foreground">{label} risk</span>
      </div>
    </div>
  );
}
