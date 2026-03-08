"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Users, MessageCircle } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useToastStore } from "@/store/toast-store";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";

interface ShareToConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
}

export function ShareToConversationSheet({
  open,
  onOpenChange,
  content,
}: ShareToConversationSheetProps) {
  const { t } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const handleSelect = (conversationId: string) => {
    const existing = useChatStore.getState().inputDrafts[conversationId] ?? "";
    const prefix = existing ? existing + "\n" : "";
    setInputDraft(conversationId, prefix + content);
    setActiveConversation(conversationId);
    onOpenChange(false);
    useToastStore.getState().addToast(t("share.sentToConversation"), "success");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-2 pt-3"
        style={{
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          maxHeight: "70vh",
        }}
      >
        <SheetHeader className="px-2 pb-2">
          <SheetTitle className="text-sm">{t("share.sendToConversation")}</SheetTitle>
        </SheetHeader>

        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />

        <div className="overflow-y-auto max-h-[55vh] px-1">
          {conversations.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <MessageCircle className="h-5 w-5 mr-2" />
              {t("chat.noConversations")}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left active:bg-accent hover:bg-accent/50 transition-colors"
                  onClick={() => handleSelect(conv.id)}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {conv.type === "direct" && (
                      <AvatarImage
                        src={conv.agentAvatarUrl ? assetUrl(conv.agentAvatarUrl) : AGENT_DEFAULT_AVATAR}
                        alt={conv.agentName}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-accent text-foreground/80 text-xs">
                      {conv.type === "group" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">
                    {conv.title ?? conv.agentName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
