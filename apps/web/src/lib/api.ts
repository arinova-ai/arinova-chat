import { BACKEND_URL } from "./config";
import { useToastStore } from "@/store/toast-store";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
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
    const error = new ApiError(res.status, message);

    // Auto-show toast unless silent mode or auth redirect
    if (!options?.silent && res.status !== 401) {
      useToastStore.getState().addToast(message);
    }

    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
