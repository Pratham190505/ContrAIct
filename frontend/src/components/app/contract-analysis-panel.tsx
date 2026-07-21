import { Link } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle, CheckCircle2, Calendar, Scale, FileX, Lightbulb } from "lucide-react";

import { type Contract } from "@/api/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceMeter } from "@/components/app/confidence-meter";
import { RiskBadge } from "@/components/app/risk-badge";
import { RiskGauge } from "@/components/app/risk-gauge";

type ContractAnalysisPanelProps = {
  contract: Contract;
  backTo?: string;
};

export function ContractAnalysisPanel({ contract, backTo = "/app/contracts" }: ContractAnalysisPanelProps) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to={backTo}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to contracts
        </Link>
      </Button>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {contract.type} - {contract.pages} pages - {contract.party}
            </p>
            <h1 className="font-display text-2xl font-semibold">{contract.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{contract.summary}</p>
          </div>
          <RiskBadge level={contract.riskScore >= 70 ? "high" : contract.riskScore >= 40 ? "medium" : "low"} />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <RiskGauge score={contract.riskScore} />
          <div className="space-y-4">
            <ConfidenceMeter value={contract.confidence} />
            <div className="flex flex-wrap gap-2">
              <Button asChild className="brand-gradient text-primary-foreground">
                <Link to="/app/analysis" search={{ contractId: contract.id }}>
                  Open analysis
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/clauses" search={{ contractId: contract.id }}>
                  View clauses
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/chat" search={{ contractId: contract.id }}>
                  Chat with contract
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/timeline" search={{ contractId: contract.id }}>
                  Timeline
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/obligations" search={{ contractId: contract.id }}>
                  Obligations
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="clauses">
        <TabsList>
          <TabsTrigger value="clauses">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Risky clauses
          </TabsTrigger>
          <TabsTrigger value="obligations">
            <Scale className="mr-1.5 h-3.5 w-3.5" /> Obligations
          </TabsTrigger>
          <TabsTrigger value="dates">
            <Calendar className="mr-1.5 h-3.5 w-3.5" /> Key dates
          </TabsTrigger>
          <TabsTrigger value="missing">
            <FileX className="mr-1.5 h-3.5 w-3.5" /> Missing
          </TabsTrigger>
          <TabsTrigger value="tips">
            <Lightbulb className="mr-1.5 h-3.5 w-3.5" /> Negotiation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clauses" className="space-y-3">
          {contract.clauses.map((cl) => (
            <Card key={cl.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{cl.category}</p>
                  <h3 className="font-display text-base font-semibold">{cl.title}</h3>
                </div>
                <RiskBadge level={cl.risk} />
              </div>
              <p className="mt-3 text-sm">{cl.plain}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Why:</strong> {cl.reason}
              </p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="obligations">
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Obligation</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contract.obligations.map((o, i) => (
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
          {contract.dates.map((d) => (
            <Card key={d.label} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Calendar className="h-4 w-4" />
                </div>
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
          {contract.missing.map((m) => (
            <Card key={m} className="flex items-start gap-3 p-4">
              <FileX className="mt-0.5 h-4 w-4 text-warning" />
              <p className="text-sm">{m}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="tips" className="space-y-2">
          {contract.negotiation.map((t) => (
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
