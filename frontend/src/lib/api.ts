import { clearStoredToken, getStoredToken } from "./auth-storage";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    if (response.status === 401) {
      clearStoredToken();
    }

    throw new ApiError(
      payload && "error" in payload ? payload.error : "Request failed",
      response.status,
      payload && "details" in payload ? payload.details : undefined,
    );
  }

  return payload.data;
}
