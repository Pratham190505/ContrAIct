import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/compare")({
  head: () => ({
    meta: [
      { title: "Compare – ContrAIct" },
      { name: "description", content: "Side-by-side comparison of two contracts or versions." },
    ],
  }),
  component: ComparePage,
});

const versionA = [
  { kind: "same", text: "1. Term: This Agreement begins on the Effective Date and remains in effect for twelve (12) months." },
  { kind: "removed", text: "2. Termination: Either party may terminate with 30 days written notice." },
  { kind: "same", text: "3. Payment: Net 60 days from invoice." },
  { kind: "same", text: "4. Confidentiality: 3 years from disclosure." },
];

const versionB = [
  { kind: "same", text: "1. Term: This Agreement begins on the Effective Date and remains in effect for twelve (12) months." },
  { kind: "added", text: "2. Termination: Either party may terminate with 60 days written notice; client may terminate for convenience with 90 days." },
  { kind: "changed", text: "3. Payment: Net 30 days from invoice." },
  { kind: "same", text: "4. Confidentiality: 5 years from disclosure." },
];

const colors: Record<string, string> = {
  same: "",
  added: "bg-success/10 border-l-2 border-success",
  removed: "bg-destructive/10 border-l-2 border-destructive line-through opacity-70",
  changed: "bg-warning/10 border-l-2 border-warning",
};

function ComparePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Compare contracts</h1>
        <p className="text-sm text-muted-foreground">Bluepeak Studio – MSA · version 1 vs version 2</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Badge variant="outline" className="border-success/40 text-success">Added</Badge>
        <Badge variant="outline" className="border-warning/40 text-warning-foreground dark:text-warning">Changed</Badge>
        <Badge variant="outline" className="border-destructive/40 text-destructive">Removed</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version A · 2026-05-10</p>
          <div className="mt-3 space-y-2">
            {versionA.map((line, i) => (
              <p key={i} className={`rounded-md px-3 py-2 text-sm ${colors[line.kind]}`}>{line.text}</p>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Version B · 2026-06-02 (current)</p>
          <div className="mt-3 space-y-2">
            {versionB.map((line, i) => (
              <p key={i} className={`rounded-md px-3 py-2 text-sm ${colors[line.kind]}`}>{line.text}</p>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
