"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const STATUS_BADGE: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  working: { label: "Working", dot: "bg-green-400", bg: "bg-green-500/15", text: "text-green-400" },
  idle: { label: "Idle", dot: "bg-yellow-400", bg: "bg-yellow-500/15", text: "text-yellow-400" },
  sleeping: { label: "Sleeping", dot: "bg-purple-400", bg: "bg-purple-500/15", text: "text-purple-400" },
};

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentStatus: string;
}

function CharacterDetail({ agentStatus }: { agentStatus: string }) {
  const badge = STATUS_BADGE[agentStatus] ?? STATUS_BADGE.idle;

  return (
    <div className="space-y-5">
      {/* Character header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-700/30 text-2xl">
          🤖
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-100">Arinova Assistant</div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-400">Your AI assistant in the cozy studio.</p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          Chat
        </button>
      </div>
    </div>
  );
}

export function CharacterModal({ isOpen, onClose, agentStatus }: CharacterModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-slate-700 bg-slate-900">
          <SheetHeader>
            <SheetTitle className="text-slate-100">Arinova Assistant</SheetTitle>
            <SheetDescription className="sr-only">Character details</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <CharacterDetail agentStatus={agentStatus} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm border-slate-700 bg-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Arinova Assistant</DialogTitle>
          <DialogDescription className="sr-only">Character details</DialogDescription>
        </DialogHeader>
        <CharacterDetail agentStatus={agentStatus} />
      </DialogContent>
    </Dialog>
  );
}
