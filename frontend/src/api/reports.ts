import { api } from "./axios";
import { unwrap } from "./axios";

export type ReportSummary = {
  contractId: string;
  contractName: string;
  generatedAt: string;
  fileSize: number;
};

export async function getReports(contractId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/report/all`);
  return unwrap<ReportSummary[]>(data);
}

export async function downloadReport(contractId: string) {
  const response = await api.get(`/api/contracts/${contractId}/report`, {
    responseType: "blob",
  });

  return response.data as Blob;
}

export async function deleteReport(contractId: string) {
  const { data } = await api.delete(`/api/contracts/${contractId}/report`);
  return unwrap<{ deleted: boolean; message?: string }>(data);
}
