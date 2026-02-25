"use client";

import { useState, useCallback } from "react";
import { SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
}

export function ReactionPicker({ onSelect }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      setOpen(false);
    },
    [onSelect]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="React"
        >
          <SmilePlus className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-auto p-1.5"
        sideOffset={4}
      >
        <div className="flex gap-0.5">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSelect(emoji)}
              className="rounded-md p-1.5 text-lg hover:bg-accent transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ReactionBadgesProps {
  reactions: Record<string, { count: number; userReacted: boolean }>;
  onToggle: (emoji: string) => void;
}

export function ReactionBadges({ reactions, onToggle }: ReactionBadgesProps) {
  const entries = Object.entries(reactions);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, { count, userReacted }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
            userReacted
              ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
              : "bg-secondary border border-border text-foreground/80 hover:bg-accent"
          }`}
        >
          <span>{emoji}</span>
          <span>{count}</span>
        </button>
      ))}
    </div>
  );
}
