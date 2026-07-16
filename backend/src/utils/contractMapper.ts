// Maps Prisma Contract model → frontend ContractDTO shape
import { Contract, Clause, Obligation, ContractDate } from "@prisma/client";
import { ContractDTO, ClauseDTO, ObligationDTO, ContractDateDTO } from "../types/contract";

type FullContract = Contract & {
  clauses: Clause[];
  obligations: Obligation[];
  dates: ContractDate[];
};

export function mapClause(c: Clause): ClauseDTO {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    original: c.original,
    plain: c.plain,
    risk: c.risk as "low" | "medium" | "high",
    reason: c.reason,
    consequences: c.consequences,
    negotiation: c.negotiation,
    confidence: c.confidence,
  };
}

export function mapObligation(o: Obligation): ObligationDTO {
  return {
    party: o.party,
    obligation: o.obligation,
    ...(o.due ? { due: o.due } : {}),
  };
}

export function mapDate(d: ContractDate): ContractDateDTO {
  return {
    label: d.label,
    date: d.date,
    kind: d.kind as "renewal" | "expiry" | "payment" | "review",
  };
}

export function mapContract(contract: FullContract): ContractDTO {
  return {
    id: contract.id,
    name: contract.name,
    type: contract.type,
    party: contract.party,
    uploadedAt: contract.uploadedAt.toISOString().split("T")[0],
    pages: contract.pages,
    riskScore: contract.riskScore,
    confidence: contract.confidence,
    status: contract.status === "ANALYZED" ? "analyzed" : "processing",
    summary: contract.summary ?? "",
    clauses: contract.clauses.map(mapClause),
    obligations: contract.obligations.map(mapObligation),
    dates: contract.dates.map(mapDate),
    missing: contract.missing,
    negotiation: contract.negotiation,
  };
}
