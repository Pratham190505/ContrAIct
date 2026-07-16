import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskGauge } from "@/components/app/risk-gauge";
import { RiskBadge } from "@/components/app/risk-badge";
import { ConfidenceMeter } from "@/components/app/confidence-meter";
import { getContract } from "@/lib/mock-contracts";

export const Route = createFileRoute("/app/contracts/$id")({
  head: () => ({
    meta: [
      { title: "Contract detail – ContrAIct" },
      { name: "description", content: "Detailed analysis for a single contract." },
    ],
  }),
  component: ContractDetail,
});

function ContractDetail() {
  const { id } = Route.useParams();
  const c = getContract(id);
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/contracts">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to contracts
        </Link>
      </Button>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{c.type} · {c.pages} pages · {c.party}</p>
            <h1 className="font-display text-2xl font-semibold">{c.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{c.summary}</p>
          </div>
          <RiskBadge level={c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low"} />
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <RiskGauge score={c.riskScore} />
          <div className="space-y-4">
            <ConfidenceMeter value={c.confidence} />
            <div className="flex flex-wrap gap-2">
              <Button asChild className="brand-gradient text-primary-foreground"><Link to="/app/analysis">Open analysis</Link></Button>
              <Button asChild variant="outline"><Link to="/app/clauses">View clauses</Link></Button>
              <Button asChild variant="outline"><Link to="/app/chat">Chat with contract</Link></Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
