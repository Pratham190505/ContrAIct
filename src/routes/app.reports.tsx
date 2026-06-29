import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/app/risk-badge";
import { contracts } from "@/lib/mock-contracts";
import { toast } from "sonner";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [
      { title: "Reports – ContrAIct" },
      { name: "description", content: "Downloadable AI analysis reports for every contract." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Branded PDF reports with full analysis, ready to share.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {contracts.map((c) => (
          <Card key={c.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg brand-gradient text-primary-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <RiskBadge level={c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low"} />
            </div>
            <h3 className="mt-4 font-display text-base font-semibold">{c.name}</h3>
            <p className="text-xs text-muted-foreground">{c.type} · {c.pages} pages</p>
            <p className="mt-2 text-xs text-muted-foreground">Generated {c.uploadedAt}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => toast.success("Report queued", { description: `${c.name}.pdf will be ready in a moment.` })}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
