import { api, unwrap } from "./axios";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type SignupPayload = LoginPayload & {
  name: string;
};

export async function login(payload: LoginPayload) {
  const { data } = await api.post("/api/auth/login", payload);
  return unwrap<AuthResponse>(data);
}

export async function signup(payload: SignupPayload) {
  const { data } = await api.post("/api/auth/register", payload);
  return unwrap<AuthResponse>(data);
}

export async function logout() {
  const { data } = await api.post("/api/auth/logout");
  return unwrap<{ loggedOut: boolean }>(data);
}

export async function getMe() {
  const { data } = await api.get("/api/auth/me");
  return unwrap<AuthUser>(data);
}
