"use client";

import { useState, useCallback } from "react";
import type { Message } from "@arinova/shared/types";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const MarkdownContent = dynamic(
  () => import("./markdown-content").then((m) => m.MarkdownContent),
  { ssr: false, loading: () => <div className="text-sm opacity-50">...</div> }
);
import { StreamingCursor } from "./streaming-cursor";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useChatStore, type ReactionInfo } from "@/store/chat-store";

const EMPTY_REACTIONS: Record<string, ReactionInfo> = {};
import {
  Bot,
  User,
  Copy,
  Check,
  Trash2,
  RotateCcw,
  AlertCircle,
  FileText,
  Download,
  Square,
  Reply,
} from "lucide-react";
import { assetUrl } from "@/lib/config";
import { ReactionPicker, ReactionBadges } from "./reaction-picker";
import { MessageActionSheet } from "./message-action-sheet";
import { useDoubleTap } from "@/hooks/use-double-tap";

interface MessageBubbleProps {
  message: Message;
  agentName?: string;
  highlightQuery?: string;
}

function formatTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function MessageBubble({ message, agentName, highlightQuery }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";
  const isCancelled = message.status === "cancelled";
  const [copied, setCopied] = useState(false);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const conversationMembers = useChatStore((s) => s.conversationMembers);
  const members = conversationMembers[message.conversationId] ?? [];
  const mentionNames = members.length > 0 ? members.map((m) => m.agentName) : undefined;
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const reactionsByMessage = useChatStore((s) => s.reactionsByMessage);
  const reactions = reactionsByMessage[message.id] ?? EMPTY_REACTIONS;

  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const doubleTapHandlers = useDoubleTap(() => {
    if (!isStreaming) setActionSheetOpen(true);
  });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [message.content]);

  const handleDelete = useCallback(() => {
    deleteMessage(message.conversationId, message.id);
  }, [deleteMessage, message.conversationId, message.id]);

  const handleRetry = useCallback(() => {
    // Find the last user message in the conversation and resend it
    const messages = messagesByConversation[message.conversationId] ?? [];
    // Walk backwards to find the most recent user message before/at this error message
    let lastUserContent: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserContent = messages[i].content;
        break;
      }
    }
    if (lastUserContent) {
      // Delete the errored message first, then resend
      deleteMessage(message.conversationId, message.id);
      sendMessage(lastUserContent);
    }
  }, [messagesByConversation, message.conversationId, message.id, deleteMessage, sendMessage]);

  const handleReply = useCallback(() => {
    setReplyingTo(message);
  }, [setReplyingTo, message]);

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser
              ? "bg-blue-600 text-white"
              : "bg-neutral-700 text-neutral-200"
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className="flex items-end gap-2 max-w-[75%] min-w-0">
        <div className="relative min-w-0" {...doubleTapHandlers}>
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 overflow-hidden",
              isUser
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-100",
              isError && "border border-red-500/30",
              isCancelled && "border border-neutral-500/30"
            )}
          >
            {!isUser && (message.senderAgentName || agentName) && (
              <p className="mb-1 text-xs font-medium text-blue-400">
                {message.senderAgentName || agentName}
              </p>
            )}
            {isError && (
              <div className="mb-1 flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>Error</span>
              </div>
            )}
            {isCancelled && (
              <div className="mb-1 flex items-center gap-1 text-xs text-neutral-400">
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>Stopped</span>
              </div>
            )}
            {/* Reply quote */}
            {message.replyTo && (
              <div className="mb-1.5 rounded-lg bg-white/5 px-3 py-1.5 border-l-2 border-blue-400/50">
                <p className="text-[11px] font-medium text-blue-400/70">
                  {message.replyTo.senderAgentName ?? (message.replyTo.role === "user" ? "You" : agentName ?? "Agent")}
                </p>
                <p className="text-xs text-neutral-400 line-clamp-2">
                  {message.replyTo.content}
                </p>
              </div>
            )}
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-1 space-y-1">
                {message.attachments.map((att) =>
                  att.fileType.startsWith("image/") ? (
                    <a
                      key={att.id}
                      href={assetUrl(att.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={assetUrl(att.url)}
                        alt={att.fileName}
                        className="max-w-full max-h-64 rounded-lg object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      key={att.id}
                      href={assetUrl(att.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-neutral-700/50 px-3 py-2 text-xs hover:bg-neutral-700"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{att.fileName}</span>
                      <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                  )
                )}
              </div>
            )}
            {message.content ? (
              <MarkdownContent
                content={
                  // Strip image/file markdown when attachments already render them
                  message.attachments?.length
                    ? message.content.replace(/!?\[[^\]]*\]\([^)]+\/uploads\/[^)]+\)/g, "").trim()
                    : message.content
                }
                highlightQuery={highlightQuery}
                mentionNames={mentionNames}
                streaming={isStreaming}
              />
            ) : isStreaming ? (
              <StreamingCursor />
            ) : null}
            {isStreaming && message.content && <StreamingCursor />}
          </div>

          {/* Reaction badges */}
          <ReactionBadges
            reactions={reactions}
            onToggle={(emoji) => toggleReaction(message.id, emoji)}
          />

          {/* Timestamp + Read receipt */}
          {showTimestamps && message.createdAt && (
            <p className={cn(
              "mt-1 text-[10px] text-muted-foreground/60 flex items-center gap-1",
              isUser ? "justify-end" : "justify-start"
            )}>
              {formatTimestamp(message.createdAt)}
              {isUser && message.status === "completed" && !message.id.startsWith("temp-") && (
                <Check className="h-2.5 w-2.5 text-blue-400" />
              )}
            </p>
          )}

          {/* Hover action buttons */}
          {!isStreaming && (
            <div
              className={cn(
                "absolute -top-8 flex items-center gap-0.5 rounded-lg border border-border bg-neutral-800 p-0.5 opacity-0 shadow-md transition-opacity group-hover:opacity-100",
                isUser ? "right-0" : "left-0"
              )}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopy}
                className="h-6 w-6 text-neutral-400 hover:text-neutral-100"
                title="Copy message"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>

              <ReactionPicker
                onSelect={(emoji) => toggleReaction(message.id, emoji)}
              />

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleReply}
                className="h-6 w-6 text-neutral-400 hover:text-blue-400"
                title="Reply"
              >
                <Reply className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDelete}
                className="h-6 w-6 text-neutral-400 hover:text-red-400"
                title="Delete message"
              >
                <Trash2 className="h-3 w-3" />
              </Button>

              {isError && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleRetry}
                  className="h-6 w-6 text-neutral-400 hover:text-blue-400"
                  title="Retry message"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Stop button next to streaming message */}
        {isStreaming && !isUser && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => cancelStream(message.id)}
            className="mb-1 h-7 w-7 shrink-0 rounded-full border border-neutral-600 text-neutral-400 hover:border-red-500 hover:text-red-400"
            title="Stop generating"
          >
            <Square className="h-3 w-3 fill-current" />
          </Button>
        )}
      </div>

      <MessageActionSheet
        message={message}
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onRetry={handleRetry}
        onReply={handleReply}
        onReact={(emoji) => toggleReaction(message.id, emoji)}
      />
    </div>
  );
}
