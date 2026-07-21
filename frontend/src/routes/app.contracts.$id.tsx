import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { getContract } from "@/api/contracts";
import { ContractAnalysisPanel } from "@/components/app/contract-analysis-panel";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";

export const Route = createFileRoute("/app/contracts/$id")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Contract detail - ContrAIct" },
      { name: "description", content: "Detailed analysis for a single contract." },
    ],
  }),
  component: ContractDetail,
});

function ContractDetail() {
  const { id } = Route.useParams();
  const { data: c, isError, error } = useQuery({
    queryKey: ["contracts", id],
    queryFn: () => getContract(id),
  });

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof Error ? error.message : "Failed to load contract");
    }
  }, [error, isError]);

  if (!c) {
    return null;
  }

  return <ContractAnalysisPanel contract={c} />;
}
