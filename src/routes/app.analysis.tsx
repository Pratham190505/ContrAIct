import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Calendar, Scale, FileX, Lightbulb } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskGauge } from "@/components/app/risk-gauge";
import { RiskBadge } from "@/components/app/risk-badge";
import { ConfidenceMeter } from "@/components/app/confidence-meter";
import { contracts } from "@/lib/mock-contracts";

export const Route = createFileRoute("/app/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis – ContrAIct" },
      { name: "description", content: "Executive summary, risk score, obligations, dates, and negotiation tips for your contract." },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const c = contracts[0];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{c.type} · {c.party}</p>
          <h1 className="font-display text-3xl font-semibold">{c.name}</h1>
        </div>
        <RiskBadge level="high" />
      </div>

      <Card className="p-6">
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <RiskGauge score={c.riskScore} />
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Executive summary</p>
              <p className="mt-1.5 text-sm leading-relaxed">{c.summary}</p>
            </div>
            <ConfidenceMeter value={c.confidence} />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="risky">
        <TabsList>
          <TabsTrigger value="risky"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Risky clauses</TabsTrigger>
          <TabsTrigger value="obligations"><Scale className="mr-1.5 h-3.5 w-3.5" />Obligations</TabsTrigger>
          <TabsTrigger value="dates"><Calendar className="mr-1.5 h-3.5 w-3.5" />Key dates</TabsTrigger>
          <TabsTrigger value="missing"><FileX className="mr-1.5 h-3.5 w-3.5" />Missing</TabsTrigger>
          <TabsTrigger value="tips"><Lightbulb className="mr-1.5 h-3.5 w-3.5" />Negotiation</TabsTrigger>
        </TabsList>

        <TabsContent value="risky" className="space-y-3">
          {c.clauses.map((cl) => (
            <Card key={cl.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{cl.category}</p>
                  <h3 className="font-display text-base font-semibold">{cl.title}</h3>
                </div>
                <RiskBadge level={cl.risk} />
              </div>
              <p className="mt-3 text-sm">{cl.plain}</p>
              <p className="mt-2 text-xs text-muted-foreground"><strong className="text-foreground">Why:</strong> {cl.reason}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="obligations">
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-3">Party</th><th className="px-4 py-3">Obligation</th><th className="px-4 py-3">When</th></tr>
              </thead>
              <tbody className="divide-y">
                {c.obligations.map((o, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{o.party}</td>
                    <td className="px-4 py-3">{o.obligation}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="dates" className="space-y-2">
          {c.dates.map((d) => (
            <Card key={d.label} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Calendar className="h-4 w-4" /></div>
                <div>
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="text-xs text-muted-foreground capitalize">{d.kind}</p>
                </div>
              </div>
              <p className="text-sm font-semibold">{d.date}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="missing" className="space-y-2">
          {c.missing.map((m) => (
            <Card key={m} className="flex items-start gap-3 p-4">
              <FileX className="mt-0.5 h-4 w-4 text-warning" />
              <p className="text-sm">{m}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="tips" className="space-y-2">
          {c.negotiation.map((t) => (
            <Card key={t} className="flex items-start gap-3 p-4">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              <p className="text-sm">{t}</p>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
