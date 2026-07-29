import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { contractSelectionSearchSchema } from "@/lib/contract-selection";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/app/risk-badge";
import { deleteContract, getContracts, type Contract } from "@/api/contracts";
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

export const Route = createFileRoute("/app/contracts")({
  validateSearch: contractSelectionSearchSchema,
  head: () => ({
    meta: [
      { title: "Contracts - ContrAIct" },
      { name: "description", content: "All your analyzed contracts in one place." },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { contractId: selectedContractId } = Route.useSearch();
  const [q, setQ] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const { data: contracts = [], isError, error } = useQuery({
    queryKey: ["contracts"],
    queryFn: getContracts,
  });
  const filtered = contracts.filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.type.toLowerCase().includes(q.toLowerCase()),
  );

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof Error ? error.message : "Failed to load contracts");
    }
  }, [error, isError]);

  const deleteMutation = useMutation({
    mutationFn: (contractId: string) => deleteContract(contractId),
    onSuccess: async (result, contractId) => {
      queryClient.setQueryData<Contract[]>(["contracts"], (current) =>
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
        void navigate({ to: "/app/contracts", search: {} });
      }
    },
    onError: (deleteError) => {
      toast.error(deleteError instanceof Error ? deleteError.message : "Failed to delete contract");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Contracts</h1>
          <p className="text-sm text-muted-foreground">{contracts.length} documents - click any row to open.</p>
        </div>
        <Button asChild className="brand-gradient text-primary-foreground">
          <Link to="/app/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload new
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contracts..." className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Pages</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3 text-right">Uploaded</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => (
              <tr key={c.id} className={selectedContractId === c.id ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/40"}>
                <td className="px-4 py-3 font-medium">
                  <Link
                    to="/app/contracts/$id"
                    params={{ id: c.id }}
                    search={{ contractId: c.id }}
                    className="hover:text-primary"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.type}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.party}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.pages}</td>
                <td className="px-4 py-3">
                  <RiskBadge level={c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low"} />
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{c.uploadedAt}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(c)}
                    disabled={deleteMutation.isPending && deleteTarget?.id === c.id}
                  >
                    {deleteMutation.isPending && deleteTarget?.id === c.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Outlet />

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
              This action permanently deletes:
              <br />
              Uploaded contract
              <br />
              AI analysis
              <br />
              Risk score
              <br />
              Clauses
              <br />
              Timeline
              <br />
              Reports
              <br />
              Chat history
              <br />
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
                deleteMutation.mutate(deleteTarget.id);
              }}
            >
              <Button variant="destructive" disabled={deleteMutation.isPending || !deleteTarget}>
                {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete Contract
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
