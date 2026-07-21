import { api, unwrap } from "./axios";
import { mapContract, type Clause, type Contract, type ContractDate, type Obligation } from "./contracts";

export async function getAnalysis(contractId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/analysis`);
  return mapContract(unwrap<Contract & { status: string }>(data));
}

export async function getObligations(contractId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/analysis/obligations`);
  return unwrap<Obligation[]>(data);
}

export async function getTimeline(contractId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/analysis/timeline`);
  return unwrap<ContractDate[]>(data);
}

export async function getClauses(contractId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/clauses`);
  return unwrap<Clause[]>(data);
}

export async function getClause(contractId: string, clauseId: string) {
  const { data } = await api.get(`/api/contracts/${contractId}/clauses/${clauseId}`);
  return unwrap<Clause>(data);
}
