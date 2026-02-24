"use client";

import { useChatStore } from "@/store/chat-store";
import { assetUrl } from "@/lib/config";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User } from "lucide-react";
import { VisuallyHidden } from "radix-ui";

interface AgentProfileSheetProps {
  agentId: string;
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentProfileSheet({
  agentId,
  conversationId,
  open,
  onOpenChange,
}: AgentProfileSheetProps) {
  const groupMembersData = useChatStore((s) => s.groupMembersData);
  const members = groupMembersData[conversationId];

  const agent = members?.agents.find((a) => a.agentId === agentId);
  const owner = agent?.ownerUserId
    ? members?.users.find((u) => u.userId === agent.ownerUserId)
    : undefined;

  if (!agent) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-neutral-700 bg-neutral-800 px-4 pb-6 pt-3"
      >
        <VisuallyHidden.Root>
          <SheetTitle>Agent profile</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-600" />

        {/* Agent info */}
        <div className="flex items-center gap-3">
          {agent.agentAvatarUrl ? (
            <img
              src={assetUrl(agent.agentAvatarUrl)}
              alt={agent.agentName}
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-neutral-700">
              <Bot className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-neutral-100 truncate">
              {agent.agentName}
            </p>
            {agent.agentDescription && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {agent.agentDescription}
              </p>
            )}
          </div>
        </div>

        {/* Owner section */}
        {owner && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Owner
            </p>
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 bg-neutral-700/40">
              <Avatar className="h-8 w-8 shrink-0">
                {owner.image ? (
                  <AvatarImage src={assetUrl(owner.image)} alt={owner.name ?? owner.username ?? ""} />
                ) : null}
                <AvatarFallback className="text-xs bg-neutral-600">
                  {(owner.name ?? owner.username ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-100 truncate">
                  {owner.name}
                </p>
                {owner.username && (
                  <p className="text-xs text-muted-foreground truncate">@{owner.username}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
