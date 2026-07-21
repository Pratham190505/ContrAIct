import { api, unwrap } from "./axios";

export type RiskLevel = "low" | "medium" | "high";
export type ContractStatus = "uploading" | "analyzed" | "processing" | "failed";
export type DateKind = "renewal" | "expiry" | "payment" | "review";

export type Clause = {
  id: string;
  title: string;
  category: string;
  original: string;
  plain: string;
  risk: RiskLevel;
  reason: string;
  consequences: string;
  negotiation: string;
  confidence: number;
};

export type Obligation = { party: string; obligation: string; due?: string };

export type ContractDate = { label: string; date: string; kind: DateKind };

export type Contract = {
  id: string;
  name: string;
  type: string;
  party: string;
  uploadedAt: string;
  pages: number;
  riskScore: number;
  confidence: number;
  status: ContractStatus;
  failureReason?: string;
  summary: string;
  clauses: Clause[];
  obligations: Obligation[];
  dates: ContractDate[];
  missing: string[];
  negotiation: string[];
};

type BackendContract = Omit<Contract, "status"> & {
  status: string;
};

function mapStatus(status: string): ContractStatus {
  const normalized = status.toLowerCase();
  if (normalized === "uploading") return "uploading";
  if (normalized === "analyzed") return "analyzed";
  if (normalized === "failed") return "failed";
  return "processing";
}

export function mapContract(contract: BackendContract): Contract {
  return {
    ...contract,
    status: mapStatus(contract.status),
    clauses: contract.clauses ?? [],
    obligations: contract.obligations ?? [],
    dates: contract.dates ?? [],
    missing: contract.missing ?? [],
    negotiation: contract.negotiation ?? [],
  };
}

export async function getContracts() {
  const { data } = await api.get("/api/contracts");
  return unwrap<BackendContract[]>(data).map(mapContract);
}

export async function getContract(id: string) {
  const { data } = await api.get(`/api/contracts/${id}`);
  return mapContract(unwrap<BackendContract>(data));
}

export async function uploadContract(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post("/api/contracts/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return mapContract(unwrap<BackendContract>(data));
}

export async function updateContractAnalysis(id: string, payload: unknown) {
  const { data } = await api.patch(`/api/contracts/${id}/analysis`, payload);
  return mapContract(unwrap<BackendContract>(data));
}

export async function deleteContract(id: string) {
  const { data } = await api.delete(`/api/contracts/${id}`);
  return unwrap<{ deleted: boolean }>(data);
}
