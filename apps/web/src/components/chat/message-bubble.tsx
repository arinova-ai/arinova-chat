"use client";

import { useState, useCallback } from "react";
import type { Message } from "@arinova/shared/types";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./markdown-content";
import { StreamingCursor } from "./streaming-cursor";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";
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
} from "lucide-react";
import { BACKEND_URL } from "@/lib/config";

interface MessageBubbleProps {
  message: Message;
  agentName?: string;
}

export function MessageBubble({ message, agentName }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";
  const [copied, setCopied] = useState(false);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);

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
        <div className="relative min-w-0">
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 overflow-hidden",
              isUser
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-100",
              isError && "border border-red-500/30"
            )}
          >
            {!isUser && agentName && (
              <p className="mb-1 text-xs font-medium text-blue-400">
                {agentName}
              </p>
            )}
            {isError && (
              <div className="mb-1 flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>Error</span>
              </div>
            )}
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-1 space-y-1">
                {message.attachments.map((att) =>
                  att.fileType.startsWith("image/") ? (
                    <a
                      key={att.id}
                      href={`${BACKEND_URL}${att.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={`${BACKEND_URL}${att.url}`}
                        alt={att.fileName}
                        className="max-w-full max-h-64 rounded-lg object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      key={att.id}
                      href={`${BACKEND_URL}${att.url}`}
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
              <MarkdownContent content={message.content} />
            ) : isStreaming ? (
              <StreamingCursor />
            ) : null}
            {isStreaming && message.content && <StreamingCursor />}
          </div>

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
            onClick={cancelStream}
            className="mb-1 h-7 w-7 shrink-0 rounded-full border border-neutral-600 text-neutral-400 hover:border-red-500 hover:text-red-400"
            title="Stop generating"
          >
            <Square className="h-3 w-3 fill-current" />
          </Button>
        )}
      </div>
    </div>
  );
}
