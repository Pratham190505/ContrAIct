import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, FileText, Calendar, ShieldAlert } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useEffect } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskGauge } from "@/components/app/risk-gauge";
import { RiskBadge } from "@/components/app/risk-badge";
import { ConfidenceMeter } from "@/components/app/confidence-meter";
import { getContracts } from "@/api/contracts";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard - ContrAIct" },
      { name: "description", content: "Overview of your analyzed contracts, risk scores, and upcoming deadlines." },
    ],
  }),
  component: Dashboard,
});

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary-glow)",
];

function Dashboard() {
  const { data: contracts = [], isError, error } = useQuery({
    queryKey: ["contracts"],
    queryFn: getContracts,
  });

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard");
    }
  }, [error, isError]);

  const featured = contracts[0];
  const analyzed = contracts.filter((c) => c.status === "analyzed").length;
  const processing = contracts.filter((c) => c.status === "processing").length;
  const avgRisk = contracts.length
    ? Math.round(contracts.reduce((sum, c) => sum + c.riskScore, 0) / contracts.length)
    : 0;
  const totalHigh = contracts.reduce(
    (n, c) => n + c.clauses.filter((cl) => cl.risk === "high").length,
    0,
  );
  const upcoming = contracts.flatMap((c) => c.dates).slice(0, 4);
  const categoryRiskData = Array.from(
    contracts
      .flatMap((c) => c.clauses)
      .reduce((map, clause) => map.set(clause.category, (map.get(clause.category) ?? 0) + 1), new Map<string, number>()),
    ([name, value]) => ({ name, value }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Welcome back, Jordan</h1>
        <p className="text-sm text-muted-foreground">
          {analyzed} contracts analyzed · {totalHigh} high-risk clauses flagged this month.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Contracts analyzed" value={String(analyzed)} hint={`${processing} processing`} icon={FileText} />
        <Kpi label="Avg risk score" value={String(avgRisk)} hint={avgRisk >= 70 ? "High" : avgRisk >= 40 ? "Medium" : "Low"} icon={ShieldAlert} />
        <Kpi label="High-risk clauses" value={String(totalHigh)} hint="Across all docs" icon={AlertTriangle} />
        <Kpi label="Upcoming deadlines" value={String(upcoming.length)} hint="Next 90 days" icon={Calendar} />
      </div>

      {featured ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Featured contract */}
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Most recent</p>
                <h2 className="font-display text-xl font-semibold">{featured.name}</h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">{featured.summary}</p>
              </div>
              <RiskBadge level={featured.riskScore >= 70 ? "high" : featured.riskScore >= 40 ? "medium" : "low"} />
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <RiskGauge score={featured.riskScore} />
              <div className="space-y-4">
                <ConfidenceMeter value={featured.confidence} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Clauses" value={String(featured.clauses.length)} />
                  <Stat label="Obligations" value={String(featured.obligations.length)} />
                  <Stat label="Key dates" value={String(featured.dates.length)} />
                </div>
                <Button asChild className="brand-gradient text-primary-foreground">
                  <Link to="/app/analysis" search={{ contractId: featured.id }}>
                    Open analysis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>

          {/* Risk donut */}
          <Card className="p-6">
            <p className="text-xs text-muted-foreground">Risk by category</p>
            <h3 className="font-display text-base font-semibold">Where the risk lives</h3>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryRiskData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {categoryRiskData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-[11px]">
              {categoryRiskData.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{c.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">No contracts found.</p>
        </Card>
      )}

      {/* Recent contracts */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">Recent contracts</h3>
            <p className="text-xs text-muted-foreground">Click any contract to drill into clause-level analysis.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/contracts">View all</Link>
          </Button>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Risk</th>
                <th className="px-4 py-2.5">Confidence</th>
                <th className="px-4 py-2.5 text-right">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/app/contracts/$id"
                      params={{ id: c.id }}
                      search={{ contractId: c.id }}
                      className="hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.type}</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low"} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{Math.round(c.confidence * 100)}%</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{c.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof FileText;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
