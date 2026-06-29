import { Progress } from "@/components/ui/progress";

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">AI confidence (Self-Healing RAG)</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
