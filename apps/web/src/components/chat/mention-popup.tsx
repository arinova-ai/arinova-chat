"use client";

import { useEffect, useRef } from "react";
import { Bot, Users } from "lucide-react";

export interface MentionItem {
  agentId: string;
  agentName: string;
}

interface MentionPopupProps {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
  onHover: (index: number) => void;
}

export function MentionPopup({
  items,
  selectedIndex,
  onSelect,
  onHover,
}: MentionPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popupRef.current) return;
    const els = popupRef.current.querySelectorAll("[data-mention-item]");
    els[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={popupRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-neutral-900 shadow-lg"
    >
      <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        MENTION
      </div>
      {items.map((item, i) => (
        <button
          key={item.agentId}
          data-mention-item
          type="button"
          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
            i === selectedIndex
              ? "bg-neutral-800 text-foreground"
              : "text-muted-foreground hover:bg-neutral-800/50"
          }`}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
        >
          {item.agentId === "__all__" ? (
            <Users className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Bot className="h-4 w-4 shrink-0 text-blue-400" />
          )}
          <span className="text-sm">@{item.agentName}</span>
        </button>
      ))}
    </div>
  );
}
