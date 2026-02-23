"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface OfficeStatus {
  connected: boolean;
  timestamp: string;
}

type PluginState = "loading" | "connected" | "disconnected" | "error";

export function useOfficePlugin() {
  const [state, setState] = useState<PluginState>("loading");

  const check = useCallback(async () => {
    try {
      const res = await api<OfficeStatus>("/api/office/status", { silent: true });
      setState(res.connected ? "connected" : "disconnected");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { state, retry: check };
}
