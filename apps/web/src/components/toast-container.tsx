"use client";

import { useToastStore } from "@/store/toast-store";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";

const iconMap = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const colorMap = {
  error: "bg-red-950/90 border-red-800/60 text-red-200",
  success: "bg-green-950/90 border-green-800/60 text-green-200",
  info: "bg-blue-950/90 border-blue-800/60 text-blue-200",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full duration-200 ${colorMap[toast.type]}`}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
