import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, ScanLine, Brain, ShieldCheck, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getContract, uploadContract, type Contract } from "@/api/contracts";

export const Route = createFileRoute("/app/upload")({
  head: () => ({
    meta: [
      { title: "Upload contract - ContrAIct" },
      { name: "description", content: "Upload a PDF, DOCX, or scanned image and let ContrAIct extract, analyze, and risk-score it." },
    ],
  }),
  component: UploadPage,
});

const stages = [
  { key: "extract", label: "Extracting text", icon: ScanLine },
  { key: "chunk", label: "Chunking + embeddings", icon: FileText },
  { key: "rag", label: "Self-Healing RAG retrieval", icon: Brain },
  { key: "analyze", label: "Risk + clause analysis", icon: ShieldCheck },
];

function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState(1);
  const [filename, setFilename] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const activeContractIdRef = useRef<string | null>(null);

  const stopPolling = () => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    activeContractIdRef.current = null;
  };

  const syncContractCache = (next: Contract) => {
    queryClient.setQueryData<Contract[]>(["contracts"], (current) => {
      if (!current) return [next];
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
      const updated = [...current];
      updated[index] = next;
      return updated;
    });
    queryClient.setQueryData(["contracts", next.id], next);
  };

  useEffect(() => () => stopPolling(), []);

  const pollContract = async (contractId: string) => {
    stopPolling();
    activeContractIdRef.current = contractId;

    const tick = async () => {
      try {
        const next = await getContract(contractId);
        if (activeContractIdRef.current !== contractId) {
          return;
        }

        setContract(next);
        syncContractCache(next);

        if (next.status === "analyzed") {
          stopPolling();
          setStage(stages.length);
          setProcessing(false);
          toast.success("Analysis complete", { description: "Opening the report..." });
          void navigate({ to: "/app/analysis" });
          return;
        }

        if (next.status === "failed") {
          stopPolling();
          toast.error(next.failureReason ?? "Analysis failed");
          setProcessing(false);
          return;
        }

        pollTimeoutRef.current = window.setTimeout(() => {
          void tick();
        }, 3000);
      } catch (error) {
        stopPolling();
        toast.error(error instanceof Error ? error.message : "Failed to refresh contract status");
        setProcessing(false);
      }
    };

    pollTimeoutRef.current = window.setTimeout(() => {
      void tick();
    }, 3000);
  };

  const startUpload = async (file?: File) => {
    if (!file) {
      toast.error("Choose a file to upload");
      return;
    }

    setFilename(file.name);
    setProcessing(true);
    setStage(1);
    setContract(null);
    stopPolling();

    try {
      const uploaded = await uploadContract(file);
      setContract(uploaded);
      syncContractCache(uploaded);
      setStage(uploaded.status === "analyzed" ? stages.length : 1);
      if (uploaded.status === "analyzed") {
        setProcessing(false);
        toast.success("Analysis complete", { description: "Opening the report..." });
        void navigate({ to: "/app/analysis" });
        return;
      }
      if (uploaded.status === "failed") {
        toast.error(uploaded.failureReason ?? "Analysis failed");
        setProcessing(false);
        return;
      }
      void pollContract(uploaded.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Upload a contract</h1>
        <p className="text-sm text-muted-foreground">
          PDFs, DOCX, and scanned images supported. OCR runs automatically.
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <label
          htmlFor="file"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void startUpload(f);
          }}
          className="relative flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-border bg-secondary/30 px-6 py-16 text-center transition hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient text-primary-foreground shadow-lg">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">Drop your contract here</p>
            <p className="text-xs text-muted-foreground">or click to browse - PDF, DOCX, PNG, JPG, TIFF (max 20MB)</p>
          </div>
          <input
            id="file"
            type="file"
            className="hidden"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.tiff"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void startUpload(f);
            }}
          />
        </label>
        <div className="border-t bg-card px-6 py-4 text-center">
          <Button onClick={() => toast.error("Choose a file to upload")} variant="outline" size="sm">
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Try with a sample contract
          </Button>
        </div>
      </Card>

      <AnimatePresence>
        {processing && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="p-6">
              <p className="text-xs text-muted-foreground">{contract?.status.toUpperCase() ?? "PROCESSING"}</p>
              <h3 className="font-display text-base font-semibold">{filename}</h3>
              <Progress value={(stage / stages.length) * 100} className="mt-3 h-2" />
              <div className="mt-5 space-y-3">
                {stages.map((s, i) => {
                  const done = i < stage;
                  const active = i === stage;
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                          done
                            ? "border-success/40 bg-success/10 text-success"
                            : active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        <s.icon className="h-4 w-4" />
                      </div>
                      <span className={`text-sm ${active ? "font-medium" : done ? "" : "text-muted-foreground"}`}>
                        {s.label}
                      </span>
                      {active && (
                        <motion.span
                          className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-primary"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: ScanLine, t: "OCR included", d: "Scanned contracts work too." },
          { icon: Brain, t: "Self-Healing RAG", d: "Validates every retrieval step." },
          { icon: ShieldCheck, t: "Private by default", d: "Documents are never shared." },
        ].map((b) => (
          <Card key={b.t} className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <b.icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold">{b.t}</p>
            <p className="text-xs text-muted-foreground">{b.d}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
