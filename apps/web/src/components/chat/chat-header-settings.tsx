"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useHeaderPinStore } from "@/store/header-pin-store";
import { useTranslation } from "@/lib/i18n";
import {
  Search,
  Bell,
  SquareKanban,
  BookOpen,
  MessageSquare,
  Phone,
  Image,
  FileText,
  Brain,
  Pin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface HeaderButton {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  supportedTypes: ("h2h" | "h2a")[];
}

export const HEADER_BUTTONS: HeaderButton[] = [
  { id: "search", labelKey: "chat.search.inConversation", icon: Search, supportedTypes: ["h2h", "h2a"] },
  { id: "mute", labelKey: "chat.header.muteConversation", icon: Bell, supportedTypes: ["h2h", "h2a"] },
  { id: "kanban", labelKey: "chat.kanban.title", icon: SquareKanban, supportedTypes: ["h2h", "h2a"] },
  { id: "notebook", labelKey: "chat.notebook.title", icon: BookOpen, supportedTypes: ["h2h", "h2a"] },
  { id: "threads", labelKey: "chat.thread.title", icon: MessageSquare, supportedTypes: ["h2h", "h2a"] },
  { id: "call", labelKey: "voice.startCall", icon: Phone, supportedTypes: ["h2h"] },
  { id: "photos", labelKey: "chat.header.photos", icon: Image, supportedTypes: ["h2h", "h2a"] },
  { id: "files", labelKey: "chat.header.files", icon: FileText, supportedTypes: ["h2h", "h2a"] },
  { id: "capsule", labelKey: "memoryCapsule.title", icon: Brain, supportedTypes: ["h2a"] },
];

interface ChatHeaderSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatHeaderSettings({ open, onOpenChange }: ChatHeaderSettingsProps) {
  const { t } = useTranslation();
  const pinnedIds = useHeaderPinStore((s) => s.pinnedIds);
  const togglePin = useHeaderPinStore((s) => s.togglePin);
  const maxReached = pinnedIds.length >= 5;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pin className="h-4 w-4" />
            {t("chat.header.pinnedButtons")}
          </SheetTitle>
        </SheetHeader>
        <p className="mb-4 mt-2 text-xs text-muted-foreground">
          {t("chat.header.pinnedButtonsDesc")}
        </p>
        <div className="flex flex-col gap-1">
          {HEADER_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const isPinned = pinnedIds.includes(btn.id);
            const disabled = !isPinned && maxReached;
            const types = btn.supportedTypes.join(" / ").toUpperCase();
            return (
              <label
                key={btn.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/60"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(btn.labelKey)}</p>
                  <p className="text-[10px] text-muted-foreground">{types}</p>
                </div>
                <Switch
                  checked={isPinned}
                  disabled={disabled}
                  onCheckedChange={() => togglePin(btn.id)}
                />
              </label>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
