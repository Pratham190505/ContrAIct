import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Calendar, DollarSign, RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTimeline } from "@/api/analysis";
import { getContracts, type DateKind } from "@/api/contracts";

export const Route = createFileRoute("/app/timeline")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Timeline - ContrAIct" },
      { name: "description", content: "Upcoming renewals, expirations, and payment deadlines across your contracts." },
    ],
  }),
  component: TimelinePage,
});

const iconMap = { renewal: RefreshCw, expiry: Clock, payment: DollarSign, review: Calendar };

function TimelinePage() {
  const { contractId: selectedContractId } = Route.useSearch();
  const { data: events = [], isError, error } = useQuery({
    queryKey: ["timeline", selectedContractId],
    queryFn: async () => {
      const contracts = await getContracts();
      const grouped = await Promise.all(
        contracts.map(async (contract) => {
          const dates = await getTimeline(contract.id);
          return dates.map((d) => ({ ...d, contract: contract.name, contractId: contract.id }));
        }),
      );
      const flattened = grouped.flat().sort((a, b) => a.date.localeCompare(b.date));
      if (!selectedContractId) {
        return flattened;
      }

      return flattened.filter((event) => event.contractId === selectedContractId);
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof Error ? error.message : "Failed to load timeline");
    }
  }, [error, isError]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Timeline</h1>
        <p className="text-sm text-muted-foreground">Auto-extracted dates from every contract.</p>
      </div>

      <Card className="p-6">
        <ol className="relative ml-3 border-l-2 border-border">
          {events.map((e, i) => {
            const Icon = iconMap[e.kind as DateKind];
            return (
              <li key={i} className="mb-6 ml-6 last:mb-0">
                <span className="absolute -left-3.5 flex h-6 w-6 items-center justify-center rounded-full brand-gradient text-primary-foreground shadow">
                  <Icon className="h-3 w-3" />
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{e.label}</p>
                    <p className="text-xs text-muted-foreground">{e.contract}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{e.kind}</Badge>
                    <span className="text-sm font-medium">{e.date}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
