// ─────────────────────────────────────────────────────────────────────────────
// Shared types — mirrors frontend mock-contracts.ts exactly
// so API responses drop in as direct replacements for mock data
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export type DateKind = "renewal" | "expiry" | "payment" | "review";

export interface ClauseDTO {
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
}

export interface ObligationDTO {
  party: string;
  obligation: string;
  due?: string;
}

export interface ContractDateDTO {
  label: string;
  date: string;
  kind: DateKind;
}

export interface ChatMessageDTO {
  role: "user" | "assistant";
  text: string;
  cites?: string[];
  confidence?: number;
  attempts?: number;
  grounded?: boolean;
}

export interface ContractDTO {
  id: string;
  name: string;
  type: string;
  party: string;
  uploadedAt: string;
  pages: number;
  riskScore: number;
  confidence: number;
  status: "uploading" | "analyzed" | "processing" | "failed";
  failureReason?: string;
  summary: string;
  clauses: ClauseDTO[];
  obligations: ObligationDTO[];
  dates: ContractDateDTO[];
  missing: string[];
  negotiation: string[];
}

// API response wrappers
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Auth types
export interface RegisterBody {
  name: string;
  email: string;
  password: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

// Chat request
export interface ChatRequest {
  contractId: string;
  message: string;
}

// Compare request
export interface CompareRequest {
  contractIdA: string;
  contractIdB: string;
}
