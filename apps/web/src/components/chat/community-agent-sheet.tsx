"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { useToastStore } from "@/store/toast-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot } from "lucide-react";

interface AgentInfo {
  id: string;
  agentName: string;
  avatarUrl: string | null;
  realName?: string;
  realAvatarUrl?: string | null;
  displayName?: string | null;
  memberAvatarUrl?: string | null;
  listenMode?: string | null;
  ownerId?: string;
}

interface CommunityAgentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  agent: AgentInfo | null;
}

export function CommunityAgentSheet({ open, onOpenChange, communityId, agent }: CommunityAgentSheetProps) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const [tab, setTab] = useState<"anonymous" | "real">("anonymous");
  const [listenMode, setListenMode] = useState(agent?.listenMode ?? "all");
  const [saving, setSaving] = useState(false);

  const isOwner = agent?.ownerId === currentUserId;

  const handleListenModeChange = useCallback(async (mode: string) => {
    if (!agent) return;
    setListenMode(mode);
    setSaving(true);
    try {
      await api(`/api/communities/${communityId}/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ listenMode: mode }),
      });
      useToastStore.getState().addToast(t("communityMembers.listenModeUpdated"), "success");
    } catch {}
    setSaving(false);
  }, [communityId, agent, t]);

  if (!agent) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
        <SheetHeader className="sr-only">
          <SheetTitle>{agent.agentName}</SheetTitle>
          <SheetDescription>{t("communitySettings.agents")}</SheetDescription>
        </SheetHeader>

        {/* Tabs for owner */}
        {isOwner && agent.realName && (
          <div className="flex gap-1 mb-4">
            {(["anonymous", "real"] as const).map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === tb ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tb === "anonymous" ? t("communityAgent.anonymousTab") : t("communityAgent.realTab")}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Avatar */}
          <div className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center">
            {tab === "real" && agent.realAvatarUrl ? (
              <img src={assetUrl(agent.realAvatarUrl)} alt="" className="h-full w-full object-cover" />
            ) : agent.avatarUrl ? (
              <img src={assetUrl(agent.avatarUrl)} alt="" className="h-full w-full object-cover" />
            ) : (
              <Bot className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          {/* Name */}
          <div className="text-center">
            <h3 className="text-lg font-semibold">
              {tab === "real" ? agent.realName : agent.agentName}
            </h3>
            <Badge variant="secondary" className="mt-1">agent</Badge>
          </div>

          {/* Listen mode (owner only) */}
          {isOwner && tab === "anonymous" && (
            <div className="w-full space-y-1.5 mt-2">
              <label className="text-xs font-medium text-muted-foreground">{t("communityMembers.listenMode")}</label>
              <Select value={listenMode} onValueChange={handleListenModeChange} disabled={saving}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("communityMembers.listenAll")}</SelectItem>
                  <SelectItem value="all_mentions">{t("communityMembers.listenMention")}</SelectItem>
                  <SelectItem value="muted">{t("communityMembers.listenNone")}</SelectItem>
                  <SelectItem value="owner_only">{t("communityMembers.listenOwnerOnly")}</SelectItem>
                  <SelectItem value="owner_and_allowlist">{t("communityMembers.listenOwnerAllowlist")}</SelectItem>
                  <SelectItem value="allowlist_mentions">{t("communityMembers.listenAllowlistMentions")}</SelectItem>
                  <SelectItem value="owner_unmention_others_mention">{t("communityMembers.listenOwnerAllOthersMention")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
