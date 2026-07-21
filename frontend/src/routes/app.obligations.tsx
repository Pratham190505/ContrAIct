import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getObligations } from "@/api/analysis";
import { getContracts } from "@/api/contracts";

export const Route = createFileRoute("/app/obligations")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Obligations - ContrAIct" },
      { name: "description", content: "Rights and obligations tracker across all your contracts, grouped by party." },
    ],
  }),
  component: ObligationsPage,
});

function ObligationsPage() {
  const { contractId: selectedContractId } = Route.useSearch();
  const { data: rows = [], isError, error } = useQuery({
    queryKey: ["obligations", selectedContractId],
    queryFn: async () => {
      const contracts = await getContracts();
      const grouped = await Promise.all(
        contracts.map(async (contract) => {
          const obligations = await getObligations(contract.id);
          return obligations.map((o) => ({ ...o, contract: contract.name, contractId: contract.id }));
        }),
      );
      const flattened = grouped.flat();
      if (!selectedContractId) {
        return flattened;
      }

      return flattened.filter((row) => row.contractId === selectedContractId);
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof Error ? error.message : "Failed to load obligations");
    }
  }, [error, isError]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Obligations</h1>
        <p className="text-sm text-muted-foreground">Who owes what, and when.</p>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Obligation</th>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3 text-right">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-3"><Badge variant="outline">{r.party}</Badge></td>
                <td className="px-4 py-3">{r.obligation}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.contract}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{r.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
