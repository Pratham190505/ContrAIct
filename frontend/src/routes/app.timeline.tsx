import { createFileRoute } from "@tanstack/react-router";
import { Calendar, DollarSign, RefreshCw, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { contracts } from "@/lib/mock-contracts";

export const Route = createFileRoute("/app/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline – ContrAIct" },
      { name: "description", content: "Upcoming renewals, expirations, and payment deadlines across your contracts." },
    ],
  }),
  component: TimelinePage,
});

const iconMap = { renewal: RefreshCw, expiry: Clock, payment: DollarSign, review: Calendar };

function TimelinePage() {
  const events = contracts
    .flatMap((c) => c.dates.map((d) => ({ ...d, contract: c.name })))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Timeline</h1>
        <p className="text-sm text-muted-foreground">Auto-extracted dates from every contract.</p>
      </div>

      <Card className="p-6">
        <ol className="relative ml-3 border-l-2 border-border">
          {events.map((e, i) => {
            const Icon = iconMap[e.kind];
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
