import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/app/risk-badge";
import { contracts } from "@/lib/mock-contracts";

export const Route = createFileRoute("/app/clauses")({
  head: () => ({
    meta: [
      { title: "Clauses – ContrAIct" },
      { name: "description", content: "Clause-by-clause breakdown with plain-English rewrite, risk level, consequences, and negotiation advice." },
    ],
  }),
  component: ClausesPage,
});

function ClausesPage() {
  const c = contracts[0];
  const [selected, setSelected] = useState(c.clauses[0].id);
  const clause = c.clauses.find((x) => x.id === selected) ?? c.clauses[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Clause-by-clause</h1>
        <p className="text-sm text-muted-foreground">{c.name}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="p-2 lg:col-span-4">
          <div className="space-y-1">
            {c.clauses.map((cl) => (
              <button
                key={cl.id}
                onClick={() => setSelected(cl.id)}
                className={`block w-full rounded-lg px-3 py-3 text-left transition ${
                  cl.id === selected ? "bg-primary/10 text-foreground" : "hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{cl.title}</span>
                  <RiskBadge level={cl.risk} />
                </div>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">{cl.category}</p>
              </button>
            ))}
          </div>
        </Card>

        <motion.div key={clause.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-8">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{clause.category}</p>
                <h2 className="font-display text-xl font-semibold">{clause.title}</h2>
              </div>
              <RiskBadge level={clause.risk} />
            </div>

            <Section label="Original clause">
              <blockquote className="border-l-2 border-primary/40 bg-secondary/40 px-4 py-3 text-sm italic text-muted-foreground">
                {clause.original}
              </blockquote>
            </Section>

            <Section label="Plain English">
              <p className="text-sm">{clause.plain}</p>
            </Section>

            <Section label="Why it's risky">
              <p className="text-sm">{clause.reason}</p>
            </Section>

            <Section label="Possible consequences">
              <p className="text-sm">{clause.consequences}</p>
            </Section>

            <Section label="Negotiation suggestion">
              <p className="text-sm">{clause.negotiation}</p>
            </Section>

            <div className="mt-6 flex items-center justify-between border-t pt-4">
              <Badge variant="outline">Confidence {Math.round(clause.confidence * 100)}%</Badge>
              <span className="text-xs text-muted-foreground">Verified via Self-Healing RAG</span>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
