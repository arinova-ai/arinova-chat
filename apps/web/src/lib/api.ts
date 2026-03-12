import { BACKEND_URL } from "./config";
import { useToastStore } from "@/store/toast-store";

export class ApiError extends Error {
  data: Record<string, unknown>;
  constructor(
    public status: number,
    message: string,
    data: Record<string, unknown> = {}
  ) {
    super(message);
    this.data = data;
  }
}

export async function api<T>(
  path: string,
  options?: RequestInit & { silent?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.error ?? `HTTP ${res.status}`;
    const error = new ApiError(res.status, message, body);

    // Handle banned account — redirect to sign-in with banned indicator
    if (res.status === 403 && body.code === "ACCOUNT_BANNED") {
      if (typeof window !== "undefined") {
        window.location.href = "/login?banned=1";
      }
      throw error;
    }

    // Auto-show toast unless silent mode or auth redirect
    if (!options?.silent && res.status !== 401) {
      useToastStore.getState().addToast(message);
    }

    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
