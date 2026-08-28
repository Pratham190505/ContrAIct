import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { contractSelectionSearchSchema } from "@/lib/contract-selection";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getObligations } from "@/api/analysis";
import { getContracts } from "@/api/contracts";

type ObligationRow = {
  party: string;
  obligation: string;
  due?: string;
  contract: string;
  contractId: string;
};

export const Route = createFileRoute("/app/obligations")({
  validateSearch: contractSelectionSearchSchema,

  head: () => ({
    meta: [
      { title: "Obligations - ContrAIct" },
      {
        name: "description",
        content:
          "Rights and obligations tracker across all your contracts, grouped by party.",
      },
    ],
  }),

  component: ObligationsPage,
});

function ObligationsPage() {
  const { contractId: selectedContractId } = Route.useSearch();

  const [rows, setRows] = useState<ObligationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadObligations() {
      try {
        setIsLoading(true);

        const contracts = await getContracts();

        const grouped = await Promise.all(
          contracts.map(async (contract) => {
            const obligations = await getObligations(contract.id);

            return obligations.map((obligation) => ({
              ...obligation,
              contract: contract.name,
              contractId: contract.id,
            }));
          }),
        );

        const flattened = grouped.flat();

        const filtered = selectedContractId
          ? flattened.filter(
              (row) => row.contractId === selectedContractId,
            )
          : flattened;

        if (!cancelled) {
          setRows(filtered);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load obligations",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadObligations();

    return () => {
      cancelled = true;
    };
  }, [selectedContractId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          Obligations
        </h1>

        <p className="text-sm text-muted-foreground">
          Who owes what, and when.
        </p>
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
            {isLoading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Loading obligations...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No obligations found.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.contractId}-${index}`}>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {row.party}
                    </Badge>
                  </td>

                  <td className="px-4 py-3">
                    {row.obligation}
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {row.contract}
                  </td>

                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {row.due ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}