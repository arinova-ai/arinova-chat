"use client";

import { useState, useCallback, useMemo } from "react";
import type { Message, Attachment } from "@arinova/shared/types";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const MarkdownContent = dynamic(
  () => import("./markdown-content").then((m) => m.MarkdownContent),
  { ssr: false, loading: () => <div className="text-sm opacity-50">...</div> }
);
import { StreamingCursor } from "./streaming-cursor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useChatStore, type ReactionInfo } from "@/store/chat-store";
import { ImageLightbox } from "./image-lightbox";
import { AudioPlayer } from "./audio-player";

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
  MessageSquare,
  Clock,
  X,
} from "lucide-react";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { authClient } from "@/lib/auth-client";
import { ReactionPicker, ReactionBadges } from "./reaction-picker";
import { MessageActionSheet } from "./message-action-sheet";
import { UserProfileSheet } from "./user-profile-sheet";
import { AgentProfileSheet } from "./agent-profile-sheet";
import { useDoubleTap } from "@/hooks/use-double-tap";

// ============================================================
// Utilities
// ============================================================

function formatTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

/**
 * Normalize a URL to its decoded pathname for loose comparison.
 * Handles three levels of fallback:
 * 1. Parse as full URL → extract pathname → decode
 * 2. If URL parse fails (relative path) → decode raw string
 * 3. If decodeURIComponent fails (malformed %XX) → use raw string
 * All levels strip trailing slashes for consistent matching.
 */
function normalizeUrlForCompare(raw: string): string {
  try {
    const url = new URL(raw, "https://_");
    return decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {
    try {
      return decodeURIComponent(raw).replace(/\/+$/, "");
    } catch {
      return raw.replace(/\/+$/, "");
    }
  }
}

/**
 * Remove markdown image syntax `![alt](url)` from content when the image URL
 * matches an attachment that is already rendered by AttachmentRenderer.
 *
 * Only targets images (! prefix mandatory) — markdown links like
 * `[Attachment: voice.webm](url)` are preserved for audio/file messages.
 *
 * Uses normalized pathname comparison to handle differences in protocol,
 * host, encoding, or trailing slashes between the markdown URL and the
 * attachment URL stored in the database.
 */
function stripAttachmentMarkdown(content: string, attachmentUrls: string[]): string {
  const attPaths = new Set(attachmentUrls.map(normalizeUrlForCompare));
  return content.replace(
    /!\[[^\]]*\]\(([^)]+)\)/g,
    (match, url: string) => attPaths.has(normalizeUrlForCompare(url)) ? "" : match,
  ).trim();
}

/**
 * Determine if a message was sent by the current user.
 *
 * Cases:
 * - Optimistic messages: `id` starts with "temp-" (created locally before server confirmation)
 * - Confirmed messages: `senderUserId` matches the current session user
 * - Other users' messages: role is "user" but neither condition matches → false
 *
 * IMPORTANT: Do NOT use `!senderUserId` as an own-message signal.
 * Messages from other users may also arrive without senderUserId during
 * WS race conditions (#28, #35, #36).
 */
function isOwnMessage(message: Message, currentUserId: string | undefined): boolean {
  return message.role === "user" &&
    (message.id.startsWith("temp-") || message.senderUserId === currentUserId);
}

interface SenderDisplayInfo {
  name: string;
  color: string;
}

/**
 * Resolve the sender display name and color for the name label above the bubble.
 *
 * Returns null when no label should be shown. Display rules:
 * - Agent messages: show agent name in blue
 * - Other users' messages (not own): show user name in emerald
 * - Own messages in group conversations: show own name in emerald
 * - Own messages in 1:1: no label (null)
 */
function getSenderDisplayInfo(
  message: Message,
  isOwn: boolean,
  agentName: string | undefined,
  isGroupConversation: boolean | undefined,
): SenderDisplayInfo | null {
  if (!isOwn && (message.senderAgentName || agentName)) {
    return { name: message.senderAgentName || agentName!, color: "text-blue-400" };
  }
  if (!isOwn && !message.senderAgentName && !agentName && message.senderUserId) {
    return { name: message.senderUserName || message.senderUsername || "User", color: "text-emerald-400" };
  }
  if (isOwn && isGroupConversation && message.senderUserId) {
    return { name: message.senderUserName || message.senderUsername || "User", color: "text-emerald-400" };
  }
  return null;
}

// ============================================================
// Sub-components
// ============================================================

interface MessageAvatarProps {
  message: Message;
  isOwn: boolean;
  clickable: boolean;
  onClick: () => void;
}

/** Avatar with optional click-to-open-profile. Renders agent or user icon. */
function MessageAvatar({ message, isOwn, clickable, onClick }: MessageAvatarProps) {
  const isAgent = message.role !== "user";
  const { data: session } = authClient.useSession();
  const ownImage = isOwn ? session?.user?.image : undefined;

  const avatarContent = (
    <Avatar className="h-8 w-8 shrink-0">
      {isAgent && (
        <AvatarImage src={AGENT_DEFAULT_AVATAR} alt="Agent" className="object-cover" />
      )}
      {!isAgent && !isOwn && message.senderUserImage && (
        <AvatarImage src={assetUrl(message.senderUserImage)} alt={message.senderUserName ?? "User"} className="object-cover" />
      )}
      {!isAgent && isOwn && ownImage && (
        <AvatarImage src={assetUrl(ownImage)} alt="Me" className="object-cover" />
      )}
      <AvatarFallback
        className={cn(
          "text-xs",
          isOwn ? "bg-blue-600 text-white" : "bg-accent text-foreground/80"
        )}
      >
        {isAgent ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onClick}
      >
        {avatarContent}
      </button>
    );
  }

  return avatarContent;
}

/** Name label shown above the message bubble content. */
function SenderLabel({ info }: { info: SenderDisplayInfo | null }) {
  if (!info) return null;
  return (
    <p className={`mb-1 text-xs font-medium ${info.color}`}>
      {info.name}
    </p>
  );
}

/** Renders image, audio, or file attachments inside the bubble. */
function AttachmentRenderer({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-1 space-y-1">
      {attachments.map((att) =>
        att.fileType.startsWith("image/") ? (() => {
          const isUploading = att.url.startsWith("data:");
          return (
            <div key={att.id} className="relative inline-block">
              {isUploading ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={att.url}
                  alt={att.fileName}
                  className="max-w-full max-h-64 rounded-lg object-contain"
                />
              ) : (
                <ImageLightbox
                  src={assetUrl(att.url)}
                  alt={att.fileName}
                  className="max-w-full max-h-64 rounded-lg object-contain cursor-zoom-in"
                />
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
            </div>
          );
        })() : att.fileType.startsWith("audio/") ? (
          att.id.startsWith("temp-att-") ? (
            <div key={att.id} className="flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2 text-xs">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="text-muted-foreground">{att.duration ? `${att.duration}s` : "Uploading audio..."}</span>
            </div>
          ) : (
            <AudioPlayer
              key={att.id}
              src={assetUrl(att.url)}
              duration={att.duration}
            />
          )
        ) : (
          <a
            key={att.id}
            href={assetUrl(att.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2 text-xs hover:bg-accent"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{att.fileName}</span>
            <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        )
      )}
    </div>
  );
}

interface MessageContentProps {
  message: Message;
  highlightQuery?: string;
  mentionNames?: string[];
  isStreaming: boolean;
}

/** Markdown content with attachment-image stripping, plus streaming cursor. */
function MessageContent({ message, highlightQuery, mentionNames, isStreaming }: MessageContentProps) {
  const content = message.attachments?.length
    ? stripAttachmentMarkdown(message.content, message.attachments.map((a) => a.url))
    : message.content;

  return (
    <>
      {content ? (
        <MarkdownContent
          content={content}
          highlightQuery={highlightQuery}
          mentionNames={mentionNames}
          streaming={isStreaming}
        />
      ) : isStreaming ? (
        <StreamingCursor />
      ) : null}
      {isStreaming && message.content && <StreamingCursor />}
    </>
  );
}

interface MessageActionsProps {
  message: Message;
  isOwn: boolean;
  isError: boolean;
  isInThread?: boolean;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onOpenThread: (messageId: string) => void;
}

/** Hover action toolbar (copy, react, reply, thread, delete, retry). */
function MessageActions({
  message,
  isOwn,
  isError,
  isInThread,
  copied,
  onCopy,
  onDelete,
  onRetry,
  onReply,
  onReact,
  onOpenThread,
}: MessageActionsProps) {
  return (
    <div
      className={cn(
        "absolute -top-8 flex items-center gap-0.5 rounded-lg border border-border bg-secondary p-0.5 opacity-0 shadow-md transition-opacity group-hover:opacity-100",
        isOwn ? "right-0" : "left-0"
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onCopy}
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        title="Copy message"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>

      <ReactionPicker onSelect={onReact} />

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onReply}
        className="h-6 w-6 text-muted-foreground hover:text-blue-400"
        title="Reply"
      >
        <Reply className="h-3 w-3" />
      </Button>

      {!isInThread && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onOpenThread(message.id)}
          className="h-6 w-6 text-muted-foreground hover:text-blue-400"
          title="Start thread"
        >
          <MessageSquare className="h-3 w-3" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        className="h-6 w-6 text-muted-foreground hover:text-red-400"
        title="Delete message"
      >
        <Trash2 className="h-3 w-3" />
      </Button>

      {isError && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRetry}
          className="h-6 w-6 text-muted-foreground hover:text-blue-400"
          title="Retry message"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

interface MessageBubbleProps {
  message: Message;
  agentName?: string;
  highlightQuery?: string;
  isGroupConversation?: boolean;
  isInThread?: boolean;
}

export function MessageBubble({ message, agentName, highlightQuery, isGroupConversation, isInThread }: MessageBubbleProps) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const isUser = isOwnMessage(message, currentUserId);
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
  const cancelQueuedMessage = useChatStore((s) => s.cancelQueuedMessage);
  const queuedMessageIds = useChatStore((s) => s.queuedMessageIds);
  const openThread = useChatStore((s) => s.openThread);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const reactionsByMessage = useChatStore((s) => s.reactionsByMessage);
  const reactions = reactionsByMessage[message.id] ?? EMPTY_REACTIONS;

  const conversations = useChatStore((s) => s.conversations);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const showUserProfile = useMemo(
    () => !isUser && message.role === "user" && !!message.senderUserId,
    [isUser, message.role, message.senderUserId]
  );
  const resolvedAgentId = useMemo(() => {
    if (message.senderAgentId) return message.senderAgentId;
    const conv = conversations.find((c) => c.id === message.conversationId);
    return conv?.agentId ?? null;
  }, [message.senderAgentId, message.conversationId, conversations]);
  const showAgentProfile = useMemo(
    () => !isUser && message.role === "agent" && !!resolvedAgentId,
    [isUser, message.role, resolvedAgentId]
  );
  const showProfileClick = showUserProfile || showAgentProfile;
  const doubleTapHandlers = useDoubleTap(() => {
    if (!isStreaming) setActionSheetOpen(true);
  });

  const senderInfo = getSenderDisplayInfo(message, isUser, agentName, isGroupConversation);
  const isQueued = isUser && queuedMessageIds[message.conversationId]?.has(message.id);

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
    const messages = messagesByConversation[message.conversationId] ?? [];
    let lastUserContent: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserContent = messages[i].content;
        break;
      }
    }
    if (lastUserContent) {
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
      <MessageAvatar
        message={message}
        isOwn={isUser}
        clickable={showProfileClick}
        onClick={() => setProfileOpen(true)}
      />

      <div className="flex items-end gap-2 max-w-[75%] min-w-0">
        <div className="relative min-w-0" {...doubleTapHandlers}>
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 overflow-hidden",
              isUser
                ? "bg-blue-600 text-white"
                : "bg-secondary text-foreground",
              isError && "border border-red-500/30",
              isCancelled && "border border-neutral-500/30"
            )}
          >
            <SenderLabel info={senderInfo} />

            {isError && (
              <div className="mb-1 flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>Error</span>
              </div>
            )}
            {isCancelled && (
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
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
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {message.replyTo.content}
                </p>
              </div>
            )}

            <AttachmentRenderer attachments={message.attachments ?? []} />

            <MessageContent
              message={message}
              highlightQuery={highlightQuery}
              mentionNames={mentionNames}
              isStreaming={isStreaming}
            />
          </div>

          {/* Reaction badges */}
          <ReactionBadges
            reactions={reactions}
            onToggle={(emoji) => toggleReaction(message.id, emoji)}
          />

          {/* Thread indicator */}
          {!isInThread && message.threadSummary && message.threadSummary.replyCount > 0 && (
            <button
              type="button"
              onClick={() => openThread(message.id)}
              className="mt-1.5 flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>
                {message.threadSummary.replyCount}{" "}
                {message.threadSummary.replyCount === 1 ? "reply" : "replies"}
              </span>
            </button>
          )}

          {/* Queued indicator */}
          {isQueued && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-yellow-500">
              <Clock className="h-3 w-3" />
              <span>Queued</span>
              <button
                type="button"
                onClick={() => cancelQueuedMessage(message.conversationId, message.id)}
                className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                aria-label="Cancel queued message"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

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
            <MessageActions
              message={message}
              isOwn={isUser}
              isError={isError}
              isInThread={isInThread}
              copied={copied}
              onCopy={handleCopy}
              onDelete={handleDelete}
              onRetry={handleRetry}
              onReply={handleReply}
              onReact={(emoji) => toggleReaction(message.id, emoji)}
              onOpenThread={openThread}
            />
          )}
        </div>

        {/* Stop button next to streaming message */}
        {isStreaming && !isUser && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => cancelStream(message.id)}
            className="mb-1 h-7 w-7 shrink-0 rounded-full border border-neutral-600 text-muted-foreground hover:border-red-500 hover:text-red-400"
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

      {showUserProfile && message.senderUserId && (
        <UserProfileSheet
          userId={message.senderUserId}
          conversationId={message.conversationId}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
      {showAgentProfile && resolvedAgentId && (
        <AgentProfileSheet
          agentId={resolvedAgentId}
          conversationId={message.conversationId}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
    </div>
  );
}
