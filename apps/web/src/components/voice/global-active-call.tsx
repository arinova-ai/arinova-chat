"use client";

import { createPortal } from "react-dom";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { ActiveCall } from "./active-call";
import { useState, useEffect } from "react";

export function GlobalActiveCall() {
  const callState = useVoiceCallStore((s) => s.callState);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || callState === "idle") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <ActiveCall />
    </div>,
    document.body
  );
}
