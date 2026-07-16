import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth";
import { ok, fail } from "../utils/response";
import {
  DuplicateEmailError,
  InvalidCredentialsError,
  UserNotFoundError,
  getCurrentUser,
  loginUser,
  registerUser,
} from "../services/authService";
import { loginSchema, registerSchema } from "../validators/authSchemas";

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, "Validation failed", 400, parsed.error.flatten());
  }

  try {
    const result = await registerUser(parsed.data);
    return ok(res, result, 201);
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return fail(res, error.message, 409);
    }

    console.error("[auth/register]", error);
    return fail(res, "Registration failed", 500);
  }
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, "Validation failed", 400, parsed.error.flatten());
  }

  try {
    const result = await loginUser(parsed.data);
    return ok(res, result);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return fail(res, error.message, 401);
    }

    console.error("[auth/login]", error);
    return fail(res, "Login failed", 500);
  }
}

export function logout(_req: Request, res: Response) {
  return ok(res, { loggedOut: true });
}

export async function me(req: AuthRequest, res: Response) {
  try {
    const user = await getCurrentUser(req.userId!);
    return ok(res, user);
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return fail(res, error.message, 404);
    }

    console.error("[auth/me]", error);
    return fail(res, "Failed to fetch current user", 500);
  }
}
