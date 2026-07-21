import axios, { AxiosError } from "axios";
import { clearStoredToken, getStoredToken } from "@/lib/auth-storage";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5000").replace(/\/api\/?$/, "");

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error?: string; message?: string; details?: unknown };

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

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    if (error.response?.status === 401) {
      clearStoredToken();
    }

    const payload = error.response?.data;
    const message =
      payload && "success" in payload && payload.success === false
        ? payload.error ?? payload.message ?? "Request failed"
        : error.message;

    return Promise.reject(
      new ApiError(message, error.response?.status ?? 0, payload?.success === false ? payload.details : undefined),
    );
  },
);

export function unwrap<T>(payload: ApiResponse<T>) {
  if (!payload.success) {
    throw new ApiError(payload.error ?? payload.message ?? "Request failed", 0, payload.details);
  }

  return payload.data;
}
