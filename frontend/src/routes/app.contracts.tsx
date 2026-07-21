import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/app/risk-badge";
import { getContracts } from "@/api/contracts";

export const Route = createFileRoute("/app/contracts")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Contracts - ContrAIct" },
      { name: "description", content: "All your analyzed contracts in one place." },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const { contractId: selectedContractId } = Route.useSearch();
  const [q, setQ] = useState("");
  const { data: contracts = [], isError, error } = useQuery({
    queryKey: ["contracts"],
    queryFn: getContracts,
  });
  const filtered = contracts.filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.type.toLowerCase().includes(q.toLowerCase()),
  );

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof Error ? error.message : "Failed to load contracts");
    }
  }, [error, isError]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Contracts</h1>
          <p className="text-sm text-muted-foreground">{contracts.length} documents - click any row to open.</p>
        </div>
        <Button asChild className="brand-gradient text-primary-foreground">
          <Link to="/app/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload new
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contracts..." className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Pages</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3 text-right">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => (
              <tr key={c.id} className={selectedContractId === c.id ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/40"}>
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
                <td className="px-4 py-3 text-muted-foreground">{c.party}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.pages}</td>
                <td className="px-4 py-3">
                  <RiskBadge level={c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low"} />
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{c.uploadedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Outlet />
    </div>
  );
}
