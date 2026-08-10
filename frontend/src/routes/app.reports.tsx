import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { contractSelectionSearchSchema } from "@/lib/contract-selection";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/app/risk-badge";
import { getContracts } from "@/api/contracts";
import { deleteReport, downloadReport, getReports, type ReportSummary } from "@/api/reports";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/reports")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Reports - ContrAIct" },
      { name: "description", content: "Downloadable AI analysis reports for every contract." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<{ contractId: string; contractName: string } | null>(null);
  const { contractId: selectedContractId } = Route.useSearch();
  const { data: contracts = [], isError: contractsError, error: contractsErrorValue } = useQuery({
    queryKey: ["contracts"],
    queryFn: getContracts,
  });
  const listAnchorId = selectedContractId ?? contracts[0]?.id;
  const { data: reports = [], isError, error } = useQuery({
    queryKey: ["reports", listAnchorId],
    queryFn: () => getReports(listAnchorId!),
    enabled: Boolean(listAnchorId),
  });
  const reportByContractId = new Map(reports.map((report) => [report.contractId, report]));

  const deleteMutation = useMutation({
    mutationFn: (contractId: string) => deleteReport(contractId),
    onMutate: async (contractId) => {
      await queryClient.cancelQueries({ queryKey: ["reports", listAnchorId] });

      const previousReports = queryClient.getQueryData<ReportSummary[]>(["reports", listAnchorId]);

      if (listAnchorId) {
        queryClient.setQueryData<ReportSummary[]>(["reports", listAnchorId], (current) =>
          (current ?? previousReports ?? []).filter((report) => report.contractId !== contractId),
        );
      }

      return { previousReports };
    },
    onError: (deleteError, _contractId, context) => {
      if (listAnchorId && context?.previousReports) {
        queryClient.setQueryData(["reports", listAnchorId], context.previousReports);
      }
      toast.error(deleteError instanceof Error ? deleteError.message : "Failed to delete report");
    },
    onSuccess: async (result, contractId) => {
      queryClient.setQueryData<typeof contracts>(["contracts"], (current) =>
        (current ?? []).filter((contract) => contract.id !== contractId),
      );
      queryClient.removeQueries({
        predicate: (query) => query.queryKey.includes(contractId),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["analysis"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["timeline"] }),
        queryClient.invalidateQueries({ queryKey: ["chat"] }),
        queryClient.invalidateQueries({ queryKey: ["obligations"] }),
        queryClient.invalidateQueries({ queryKey: ["compare"] }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            ["contracts", "reports"].includes(String(query.queryKey[0])) ||
            query.queryKey.includes(contractId),
        }),
      ]);
      toast.success(result.message ?? "Contract and all associated analysis have been permanently deleted.");
      setDeleteTarget(null);
      if (selectedContractId === contractId) {
        void navigate({ to: "/app/reports", search: {} });
      } else {
        void navigate({ to: "/app/reports" });
      }
    },
  });

  useEffect(() => {
    if (contractsError || isError) {
      const message = contractsErrorValue instanceof Error ? contractsErrorValue.message : error instanceof Error ? error.message : "Failed to load reports";
      toast.error(message);
    }
  }, [contractsError, contractsErrorValue, error, isError]);

  const downloadMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const blob = await downloadReport(contractId);
      const contract = contracts.find((c) => c.id === contractId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${contract?.name ?? "contract"}-report.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success("Report downloaded");
    },
    onError: (downloadError) => {
      toast.error(downloadError instanceof Error ? downloadError.message : "Failed to download report");
    },
  });

  const deleteableReport = useMemo(() => {
    if (!deleteTarget) return null;
    return reportByContractId.get(deleteTarget.contractId) ?? null;
  }, [deleteTarget, reportByContractId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Branded PDF reports with full analysis, ready to share.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {contracts.map((c) => {
          const report = reportByContractId.get(c.id);
          return (
            <Card key={c.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg brand-gradient text-primary-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <RiskBadge level={c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low"} />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">{c.name}</h3>
              <p className="text-xs text-muted-foreground">{c.type} - {c.pages} pages</p>
              {/* TODO: backend report/all only returns generatedAt for existing reports; no generated date exists before first download. */}
              {report && <p className="mt-2 text-xs text-muted-foreground">Generated {report.generatedAt}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadMutation.mutate(c.id)}
                  disabled={downloadMutation.isPending}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
                </Button>
                {report && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget({ contractId: c.id, contractName: c.name })}
                    disabled={deleteMutation.isPending && deleteTarget?.contractId === c.id}
                  >
                    {deleteMutation.isPending && deleteTarget?.contractId === c.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contract, generated report, AI analysis, clauses, obligations, timeline, and chat history.
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              asChild
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget || deleteMutation.isPending) return;
                deleteMutation.mutate(deleteTarget.contractId);
              }}
            >
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending || !deleteTarget || !deleteableReport}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Delete Contract
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
