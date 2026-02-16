"use client";

import { Button } from "@/components/ui/button";
import { Gamepad2, Bot, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Task 10.2: Control mode UI buttons
// Task 10.5: Control mode transitions display

export type ControlMode = "agent" | "human" | "copilot";

interface ControlModeBarProps {
  mode: ControlMode;
  availableModes: ControlMode[];
  onModeChange: (mode: ControlMode) => void;
}

const MODE_CONFIG: Record<ControlMode, { label: string; icon: typeof Bot; description: string }> = {
  agent: { label: "Agent", icon: Bot, description: "AI controls the app" },
  human: { label: "You", icon: Gamepad2, description: "You control the app" },
  copilot: { label: "Copilot", icon: Users, description: "Shared control" },
};

export function ControlModeBar({ mode, availableModes, onModeChange }: ControlModeBarProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {availableModes.map((m) => {
        const config = MODE_CONFIG[m];
        const Icon = config.icon;
        const isActive = mode === m;

        return (
          <Button
            key={m}
            variant="ghost"
            size="sm"
            onClick={() => onModeChange(m)}
            className={cn(
              "gap-1.5 text-xs",
              isActive && "bg-neutral-700 text-white"
            )}
            title={config.description}
          >
            <Icon className="h-3.5 w-3.5" />
            {config.label}
          </Button>
        );
      })}
    </div>
  );
}
