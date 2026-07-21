import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { getAnalysis } from "@/api/analysis";
import { getContracts } from "@/api/contracts";
import { ContractAnalysisPanel } from "@/components/app/contract-analysis-panel";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";

export const Route = createFileRoute("/app/analysis")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Analysis - ContrAIct" },
      { name: "description", content: "Executive summary, risk score, obligations, dates, and negotiation tips for your contract." },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const { contractId: selectedContractId } = Route.useSearch();
  const { data: contracts = [], isError: contractsError, error: contractsErrorValue } = useQuery({
    queryKey: ["contracts"],
    queryFn: getContracts,
  });
  const contractId = selectedContractId ?? contracts[0]?.id;
  const { data: c, isError, error } = useQuery({
    queryKey: ["contracts", contractId, "analysis"],
    queryFn: () => getAnalysis(contractId!),
    enabled: Boolean(contractId),
  });

  useEffect(() => {
    if (contractsError || isError) {
      const message = contractsErrorValue instanceof Error ? contractsErrorValue.message : error instanceof Error ? error.message : "Failed to load analysis";
      toast.error(message);
    }
  }, [contractsError, contractsErrorValue, error, isError]);

  if (!c) {
    return null;
  }

  return <ContractAnalysisPanel contract={c} />;
}
