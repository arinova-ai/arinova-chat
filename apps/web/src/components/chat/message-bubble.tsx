"use client";

import { useState, useCallback, useMemo, useRef, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import type { Message, Attachment } from "@arinova/shared/types";
import { cn, isGroupLike } from "@/lib/utils";
import dynamic from "next/dynamic";

const MarkdownContent = dynamic(
  () => import("./markdown-content").then((m) => m.MarkdownContent),
  { ssr: false, loading: () => <div className="text-sm opacity-50">...</div> }
);
import { StreamingCursor } from "./streaming-cursor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { Button } from "@/components/ui/button";
import { useChatStore, type ReactionInfo } from "@/store/chat-store";
import { useToastStore } from "@/store/toast-store";
import { ImageLightbox } from "./image-lightbox";
import { AudioPlayer } from "./audio-player";

const EMPTY_REACTIONS: Record<string, ReactionInfo> = {};
import {
  Bot,
  User,
  Copy,
  Check,
  CheckCheck,
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
  Flag,
  Pin,
  PinOff,
  EyeOff,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { authClient } from "@/lib/auth-client";
import { ReactionPicker, ReactionBadges } from "./reaction-picker";
import { MessageContextMenu } from "./message-context-menu";
import { ShareSheet, type ShareContent } from "./share-sheet";
import { ForwardDialog } from "./forward-dialog";
import { LinkPreviewCards } from "./link-preview-card";
import { NotePreviewCard } from "./note-preview-card";
import { TaskPreviewCard } from "./task-preview-card";
import { CommitSharePreview } from "./commit-share-preview";
import { useLongPress } from "@/hooks/use-long-press";
import { useTranslation } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";

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
 * Compute the same anon hash the backend uses for community conversations.
 * SHA-256(conversationId + userId) → "anon-{first 8 bytes hex}"
 * Results are cached so the async crypto call only runs once per key.
 */
const anonHashCache = new Map<string, string>();
const anonHashPending = new Map<string, Promise<string>>();

async function computeAnonHash(conversationId: string, userId: string): Promise<string> {
  const key = `${conversationId}:${userId}`;
  const cached = anonHashCache.get(key);
  if (cached) return cached;
  const pending = anonHashPending.get(key);
  if (pending) return pending;
  const promise = (async () => {
    const encoder = new TextEncoder();
    const data = new Uint8Array([...encoder.encode(conversationId), ...encoder.encode(userId)]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hashBuffer).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const result = `anon-${hex}`;
    anonHashCache.set(key, result);
    anonHashPending.delete(key);
    return result;
  })();
  anonHashPending.set(key, promise);
  return promise;
}

/** Synchronous lookup of a previously computed anon hash. */
function getAnonHashSync(conversationId: string, userId: string): string | undefined {
  return anonHashCache.get(`${conversationId}:${userId}`);
}

/**
 * Determine if a message was sent by the current user.
 *
 * Cases:
 * - Optimistic messages: `id` starts with "temp-" (created locally before server confirmation)
 * - Confirmed messages: `senderUserId` matches the current session user
 * - Community conversations: `senderUserId` may be anon-hashed; match against cached hash
 * - Other users' messages: role is "user" but no condition matches → false
 *
 * IMPORTANT: Do NOT use `!senderUserId` as an own-message signal.
 * Messages from other users may also arrive without senderUserId during
 * WS race conditions (#28, #35, #36).
 */
export function isOwnMessage(message: Message, currentUserId: string | undefined): boolean {
  if (message.role !== "user") return false;
  if (message.id.startsWith("temp-")) return true;
  if (message.senderUserId === currentUserId) return true;
  // Check anon hash match for community conversations
  if (currentUserId && message.senderUserId?.startsWith("anon-")) {
    const anonHash = getAnonHashSync(message.conversationId, currentUserId);
    if (anonHash && message.senderUserId === anonHash) return true;
  }
  return false;
}

const STICKER_RE = /^!\[sticker\]\((\/stickers\/.+\.png)\)$/;

export function parseStickerUrl(content: string): string | null {
  const m = content.trim().match(STICKER_RE);
  return m ? m[1] : null;
}

interface SenderDisplayInfo {
  name: string;
  color: string;
  isVerified?: boolean;
  role?: string;
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
    return { name: message.senderUserName || message.senderUsername || "User", color: "text-emerald-400", isVerified: message.senderIsVerified };
  }
  if (isOwn && isGroupConversation && message.senderUserId) {
    return { name: message.senderUserName || message.senderUsername || "User", color: "text-emerald-400", isVerified: message.senderIsVerified };
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
  agentAvatarUrl?: string | null;
  role?: string;
}

/** Avatar with optional click-to-open-profile. Renders agent or user icon. */
function MessageAvatar({ message, isOwn, clickable, onClick, agentAvatarUrl, role }: MessageAvatarProps) {
  const isAgent = message.role !== "user";
  const { data: session } = authClient.useSession();
  // In community conversations, use the anonymous avatar from message data instead of session user image
  const isCommunity = useChatStore((s) => {
    const conv = s.conversations.find((c) => c.id === message.conversationId);
    return conv?.type === "community";
  });
  const ownImage = isOwn
    ? (isCommunity && message.senderUserImage ? message.senderUserImage : session?.user?.image)
    : undefined;
  const agentSrc = agentAvatarUrl ? assetUrl(agentAvatarUrl) : AGENT_DEFAULT_AVATAR;

  const avatarContent = (
    <Avatar className="h-8 w-8 shrink-0">
      {isAgent && (
        <AvatarImage src={agentSrc} alt={message.senderAgentName ?? "Agent"} className="object-cover" />
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

  const badgeOverlay = role && role !== "member" ? (
    <span className="absolute -bottom-0.5 -right-0.5 text-[8px] leading-none">
      {role === "creator" ? "👑" : role === "admin" ? "🛡️" : role === "moderator" ? "🔧" : role === "agent" ? "🤖" : ""}
    </span>
  ) : null;

  if (clickable) {
    return (
      <button
        type="button"
        className="relative h-8 w-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onClick}
      >
        {avatarContent}
        {badgeOverlay}
      </button>
    );
  }

  return <div className="relative shrink-0">{avatarContent}{badgeOverlay}</div>;
}

/** Name label shown above the message bubble content. */
function RoleBadge({ role }: { role?: string }) {
  if (!role || role === "member") return null;
  switch (role) {
    case "creator":
      return <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">👑</span>;
    case "admin":
      return <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">🛡️</span>;
    case "moderator":
      return <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-gray-400">🔧</span>;
    case "agent":
      return <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-400">🤖</span>;
    default:
      return null;
  }
}

function SenderLabel({ info }: { info: SenderDisplayInfo | null }) {
  if (!info) return null;
  return (
    <p className={`mb-1 flex items-center gap-1 text-xs font-medium ${info.color}`}>
      {info.name}
      {info.isVerified && <VerifiedBadge className="h-3.5 w-3.5 text-blue-500" />}
    </p>
  );
}

/** Grid layout for multiple image attachments. */
function ImageGrid({ images }: { images: Attachment[] }) {
  const count = images.length;
  const galleryImages = images
    .filter((a) => !a.url.startsWith("data:"))
    .map((a) => ({ src: assetUrl(a.url), alt: a.fileName }));

  const renderImage = (att: Attachment, index: number, className: string) => {
    const isUploading = att.url.startsWith("data:");
    const galleryIndex = isUploading
      ? 0
      : galleryImages.findIndex((g) => g.src === assetUrl(att.url));
    return (
      <div key={att.id} className={cn("relative overflow-hidden bg-muted", className)}>
        {isUploading ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={att.url}
              alt={att.fileName}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          </>
        ) : (
          <ImageLightbox
            src={assetUrl(att.url)}
            alt={att.fileName}
            className="h-full w-full object-cover cursor-zoom-in"
            images={galleryImages.length > 1 ? galleryImages : undefined}
            initialIndex={galleryIndex >= 0 ? galleryIndex : 0}
          />
        )}
      </div>
    );
  };

  if (count === 1) {
    const img = images[0];
    const hasSize = img.width && img.height;
    return (
      <div
        className="max-w-[280px] md:max-w-[360px] rounded-lg overflow-hidden bg-muted"
        style={{
          aspectRatio: hasSize ? `${img.width}/${img.height}` : "4/3",
          maxHeight: 400,
        }}
      >
        {renderImage(img, 0, "aspect-auto")}
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 max-w-[280px] md:max-w-[360px] rounded-lg overflow-hidden">
        {images.map((att, i) => renderImage(att, i, "aspect-square"))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="max-w-[280px] md:max-w-[360px] rounded-lg overflow-hidden space-y-0.5">
        {renderImage(images[0], 0, "aspect-video")}
        <div className="grid grid-cols-2 gap-0.5">
          {images.slice(1).map((att, i) => renderImage(att, i + 1, "aspect-square"))}
        </div>
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className="grid grid-cols-2 gap-0.5 max-w-[280px] md:max-w-[360px] rounded-lg overflow-hidden">
        {images.map((att, i) => renderImage(att, i, "aspect-square"))}
      </div>
    );
  }

  // 5-9 images: 3-column grid, last cell shows +N overlay if needed
  const maxVisible = 9;
  const visible = images.slice(0, maxVisible);
  const remaining = count - maxVisible;

  return (
    <div className="grid grid-cols-3 gap-0.5 max-w-[280px] md:max-w-[360px] rounded-lg overflow-hidden">
      {visible.map((att, i) => {
        const isLast = i === visible.length - 1 && remaining > 0;
        return (
          <div key={att.id} className="relative aspect-square overflow-hidden">
            {renderImage(att, i, "aspect-square")}
            {isLast && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-lg font-bold text-white">+{remaining}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Renders image, audio, or file attachments inside the bubble. */
function AttachmentRenderer({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  const imageAtts = attachments.filter((a) => a.fileType.startsWith("image/"));
  const otherAtts = attachments.filter((a) => !a.fileType.startsWith("image/"));

  return (
    <div className="mb-1 space-y-1">
      {imageAtts.length > 0 && <ImageGrid images={imageAtts} />}
      {otherAtts.map((att) =>
        att.fileType.startsWith("audio/") ? (
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
  onReport?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
}

/** Hover action toolbar (copy, react, reply, thread, delete, retry). */
/**
 * Read receipt checkmarks (3 stages):
 *   Grey ✓  — sending (optimistic, no server confirmation yet)
 *   Blue ✓  — server confirmed (has real id + seq)
 *   Blue ✓✓ — read by other party (WS read_receipt, excludes sender)
 */
function MessageCheckmarks({ message }: { message: Message }) {
  const readReceipts = useChatStore((s) => s.readReceipts[message.conversationId]);

  // Error — no checkmark
  if (message.status === "error") return null;

  // Stage 1: Grey check — still sending (pending / optimistic)
  if (message.status === "pending" || message.id.startsWith("temp-")) {
    return <Check className="h-2.5 w-2.5 text-muted-foreground/40" />;
  }

  // Stage 2/3: Server confirmed — check read receipts
  const seq = message.seq;
  if (seq && seq > 0) {
    const senderId = message.senderUserId;
    const hasReaders = readReceipts && Object.entries(readReceipts).some(
      ([userId, readSeq]) => userId !== senderId && readSeq >= seq
    );

    if (hasReaders) {
      // Stage 3: Blue double check — read by other party
      return <CheckCheck className="h-2.5 w-2.5 text-blue-400" />;
    }
  }

  // Stage 2: Blue single check — server confirmed
  return <Check className="h-2.5 w-2.5 text-blue-400" />;
}

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
  onReport,
  isPinned,
  onPin,
}: MessageActionsProps) {
  const { t } = useTranslation();
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
        title={t("chat.actions.copy")}
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
        title={t("chat.actions.reply")}
      >
        <Reply className="h-3 w-3" />
      </Button>

      {!isInThread && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onOpenThread(message.id)}
          className="h-6 w-6 text-muted-foreground hover:text-blue-400"
          title={t("chat.actions.startThread")}
        >
          <MessageSquare className="h-3 w-3" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onPin}
        className="h-6 w-6 text-muted-foreground hover:text-yellow-400"
        title={isPinned ? "Unpin" : "Pin"}
      >
        {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onReport}
        className="h-6 w-6 text-muted-foreground hover:text-orange-400"
        title="Report"
      >
        <Flag className="h-3 w-3" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        className="h-6 w-6 text-muted-foreground hover:text-red-400"
        title={t("chat.actions.delete")}
      >
        <Trash2 className="h-3 w-3" />
      </Button>

      {isError && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRetry}
          className="h-6 w-6 text-muted-foreground hover:text-blue-400"
          title={t("chat.actions.retry")}
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
  selectionMode?: boolean;
  onEnterSelectionMode?: (messageId: string) => void;
}

export const MessageBubble = memo(function MessageBubble({ message, agentName, highlightQuery, isGroupConversation, isInThread, selectionMode, onEnterSelectionMode }: MessageBubbleProps) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === message.conversationId));
  // For community conversations, pre-compute the anon hash so isOwnMessage can match
  const [, setAnonReady] = useState(0);
  useEffect(() => {
    if (currentUserId && conversation?.type === "community" && !getAnonHashSync(message.conversationId, currentUserId)) {
      computeAnonHash(message.conversationId, currentUserId).then(() => setAnonReady((n) => n + 1));
    }
  }, [currentUserId, message.conversationId, conversation?.type]);
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
  const isQueued = useChatStore((s) => isUser && (s.queuedMessageIds[message.conversationId]?.has(message.id) ?? false));
  const openThread = useChatStore((s) => s.openThread);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const reactionsByMessage = useChatStore((s) => s.reactionsByMessage);
  const reactions = reactionsByMessage[message.id] ?? EMPTY_REACTIONS;
  const togglePin = useChatStore((s) => s.togglePin);
  const isPinned = useChatStore((s) => s.pinnedMessageIds[message.conversationId]?.has(message.id) ?? false);

  const router = useRouter();
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  const handleReport = async () => {
    if (!reportReason) return;
    setReportLoading(true);
    try {
      await api(`/api/messages/${message.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason, description: reportDesc || undefined }),
      });
      setReportOpen(false);
      setReportReason("");
      setReportDesc("");
    } catch {}
    setReportLoading(false);
  };

  const isCommunityConversation = conversation?.type === "community";
  const showUserProfile = useMemo(
    () => !isUser && message.role === "user" && !!message.senderUserId && !isCommunityConversation,
    [isUser, message.role, message.senderUserId, isCommunityConversation]
  );
  const resolvedAgentId = useMemo(() => {
    if (message.senderAgentId) return message.senderAgentId;
    return conversation?.agentId ?? null;
  }, [message.senderAgentId, conversation]);
  const groupMembersData = useChatStore((s) => s.groupMembersData);
  const resolvedAgentAvatarUrl = useMemo(() => {
    if (message.senderAgentId) {
      const gm = groupMembersData[message.conversationId];
      const agent = gm?.agents.find((a) => a.agentId === message.senderAgentId);
      if (agent?.agentAvatarUrl) return agent.agentAvatarUrl;
    }
    return conversation?.agentAvatarUrl ?? null;
  }, [message.senderAgentId, message.conversationId, groupMembersData, conversation]);
  const showAgentProfile = useMemo(
    () => !isUser && message.role === "agent" && !!resolvedAgentId,
    [isUser, message.role, resolvedAgentId]
  );
  const showOwnProfile = useMemo(
    () => isUser && !!currentUserId && !isCommunityConversation,
    [isUser, currentUserId, isCommunityConversation]
  );
  const showCommunityHide = isCommunityConversation && !isUser && message.role === "user" && !!message.senderUserId;
  const showProfileClick = showUserProfile || showAgentProfile || showOwnProfile || showCommunityHide;
  const [hidePopoverOpen, setHidePopoverOpen] = useState(false);
  const longPressHandlers = useLongPress(() => {
    if (!isStreaming && !selectionMode) setActionSheetOpen(true);
  });

  const senderInfo = getSenderDisplayInfo(message, isUser, agentName, isGroupConversation);

  // For community conversations: override names with display_name + attach role badge
  if (senderInfo && isCommunityConversation) {
    const gm = groupMembersData[message.conversationId];
    if (message.senderUserId && gm?.users) {
      const userMember = gm.users.find((u) => u.userId === message.senderUserId);
      if (userMember) {
        senderInfo.role = userMember.role;
        // Override name with community display_name
        if (userMember.name) senderInfo.name = userMember.name;
      }
    } else if (message.senderAgentId && gm?.agents) {
      senderInfo.role = "agent";
      // Override agent name with community display_name (agentName from groups.rs already has display_name)
      const agentMember = gm.agents.find((a) => a.agentId === message.senderAgentId);
      if (agentMember?.agentName) senderInfo.name = agentMember.agentName;
    }
  }
  const stickerUrl = useMemo(() => parseStickerUrl(message.content), [message.content]);

  // --- Select mode: popup textarea for partial text copy ---
  const [selectOpen, setSelectOpen] = useState(false);
  const selectTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSelect = useCallback(() => {
    setSelectOpen(true);
  }, []);

  // Auto-select all text when textarea dialog opens
  useEffect(() => {
    if (!selectOpen) return;
    // Wait for dialog to mount, then select all text
    const timer = setTimeout(() => {
      selectTextareaRef.current?.select();
    }, 100);
    return () => clearTimeout(timer);
  }, [selectOpen]);

  const handleCopy = useCallback(() => {
    const text = message.content;
    // Primary: Clipboard API (permission granted synchronously in user gesture)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        // Fallback: execCommand for very old browsers
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); } catch { /* ignore */ }
        document.body.removeChild(ta);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    useToastStore.getState().addToast(t("chat.selection.copied"), "success");
    setTimeout(() => setCopied(false), 2000);
  }, [message.content, t]);

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

  const handlePin = useCallback(async () => {
    togglePin(message.conversationId, message.id);
  }, [togglePin, message.conversationId, message.id]);

  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContent | null>(null);

  const handleShare = useCallback(() => {
    setShareContent({
      type: "message",
      title: senderInfo?.name ?? "",
      text: message.content,
    });
    setShareSheetOpen(true);
  }, [senderInfo?.name, message.content]);

  return (
    <div
      data-message-id={message.id}
      className={cn(
        "group relative flex gap-3 px-4 transition-shadow",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {showCommunityHide ? (
        <MessageAvatar
          message={message}
          isOwn={isUser}
          clickable
          agentAvatarUrl={resolvedAgentAvatarUrl}
          role={senderInfo?.role}
          onClick={() => {
            if (message.senderUserId) {
              window.dispatchEvent(new CustomEvent("community-member-profile", {
                detail: { userId: message.senderUserId, conversationId: message.conversationId },
              }));
            }
          }}
        />
      ) : (
        <MessageAvatar
          message={message}
          isOwn={isUser}
          clickable={showProfileClick}
          agentAvatarUrl={resolvedAgentAvatarUrl}
          role={senderInfo?.role}
          onClick={() => {
            if (showOwnProfile && currentUserId) {
              if (isCommunityConversation) {
                window.dispatchEvent(new CustomEvent("community-member-profile", {
                  detail: { userId: currentUserId, conversationId: message.conversationId },
                }));
              } else {
                router.push(`/profile/${currentUserId}`);
              }
            } else if (showUserProfile && message.senderUserId) {
              if (isCommunityConversation) {
                window.dispatchEvent(new CustomEvent("community-member-profile", {
                  detail: { userId: message.senderUserId, conversationId: message.conversationId },
                }));
              } else {
                router.push(`/profile/${message.senderUserId}`);
              }
            } else if (showAgentProfile && resolvedAgentId) {
              if (conversation?.type === "community") {
                window.dispatchEvent(new CustomEvent("community-agent-profile", {
                  detail: { agentId: resolvedAgentId, conversationId: message.conversationId },
                }));
              } else {
                const suffix = isGroupLike(conversation?.type) ? `?convId=${message.conversationId}` : "";
                router.push(`/agent/${resolvedAgentId}${suffix}`);
              }
            }
          }}
        />
      )}

      <div className="flex items-end gap-2 max-w-[75%] min-w-0">
        <div
          className="relative min-w-0 select-none md:select-auto"
          style={{ WebkitTouchCallout: "none" }}
          onContextMenu={(e) => { if (!selectionMode && matchMedia("(pointer: coarse)").matches) e.preventDefault(); }}
          {...(selectionMode ? {} : longPressHandlers)}
        >
          {/* Reply quote — above the bubble (Telegram/Discord style) */}
          {message.replyTo && (
            <button
              type="button"
              className={cn(
                "mb-1 flex items-center gap-1.5 text-xs w-full cursor-pointer",
                isUser ? "justify-end" : "justify-start"
              )}
              onClick={() => {
                if (!message.replyToId) return;
                useChatStore.setState({ highlightMessageId: message.replyToId });
                setTimeout(() => {
                  if (useChatStore.getState().highlightMessageId === message.replyToId) {
                    useChatStore.setState({ highlightMessageId: null });
                  }
                }, 1000);
              }}
            >
              <Reply className="h-3 w-3 text-blue-400/60 shrink-0" />
              <div className="min-w-0 rounded-lg bg-accent/60 px-2.5 py-1 border-l-2 border-blue-400/50 hover:bg-accent/80 transition-colors text-left">
                <p className="text-[11px] font-medium text-blue-400/70 truncate">
                  {message.replyTo.senderAgentName ?? (message.replyTo.role === "user" ? t("common.you") : agentName ?? "Agent")}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {message.replyTo.content}
                </p>
              </div>
            </button>
          )}

          {stickerUrl ? (
            /* Sticker: no bubble frame, transparent background, fixed placeholder */
            <div className="h-32 w-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stickerUrl}
                alt="sticker"
                className="h-32 w-32 object-contain"
              />
            </div>
          ) : (
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
                <span>{t("chat.status.error")}</span>
              </div>
            )}
            {isCancelled && (
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>{t("chat.status.stopped")}</span>
              </div>
            )}

            <AttachmentRenderer attachments={message.attachments ?? []} />

            <MessageContent
              message={message}
              highlightQuery={highlightQuery}
              mentionNames={mentionNames}
              isStreaming={isStreaming}
            />
            {!isStreaming && message.linkPreviews && message.linkPreviews.length > 0 && (
              <LinkPreviewCards linkPreviews={message.linkPreviews} />
            )}
            {message.metadata && typeof (message.metadata as Record<string, unknown>).noteId === "string" && (
              <NotePreviewCard metadata={message.metadata as { noteId: string; title: string; preview: string; tags: string[] }} />
            )}
            {message.metadata && typeof (message.metadata as Record<string, unknown>).cardId === "string" && (
              <TaskPreviewCard metadata={message.metadata as { cardId: string; title: string; preview?: string; priority?: string; columnName?: string }} />
            )}
            {message.metadata && (message.metadata as Record<string, unknown>).type === "commit_share" && (
              <CommitSharePreview metadata={message.metadata as { commitHash: string; title: string; preview?: string }} />
            )}
          </div>
          )}

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
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-text hover:bg-brand/20 transition-colors"
            >
              <MessageSquare className="h-3 w-3" />
              <span>
                {message.threadSummary.replyCount}{" "}
                {message.threadSummary.replyCount === 1 ? t("chat.replies.one") : t("chat.replies.other")}
              </span>
            </button>
          )}

          {/* Queued indicator */}
          {isQueued && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-yellow-500">
              <Clock className="h-3 w-3" />
              <span>{t("chat.status.queued")}</span>
              <button
                type="button"
                onClick={() => cancelQueuedMessage(message.conversationId, message.id)}
                className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                aria-label={t("chat.actions.cancelQueued")}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Timestamp + Read receipt */}
          {message.createdAt && (
            <p suppressHydrationWarning className={cn(
              "mt-1 text-[11px] text-muted-foreground/60 flex items-center gap-1",
              isUser ? "justify-end" : "justify-start"
            )}>
              {formatTimestamp(message.createdAt)}
              {isUser && (
                <MessageCheckmarks message={message} />
              )}
            </p>
          )}

          {/* Hover action buttons */}
          {!isStreaming && !selectionMode && (
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
              onReport={() => setReportOpen(true)}
              onPin={handlePin}
              isPinned={isPinned}
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
            title={t("chat.actions.stopGenerating")}
          >
            <Square className="h-3 w-3 fill-current" />
          </Button>
        )}
      </div>

      {/* Mobile: Telegram-style context menu; hidden on md+ */}
      {!selectionMode && (
        <MessageContextMenu
          message={message}
          open={actionSheetOpen}
          onOpenChange={setActionSheetOpen}
          isOwnMessage={isUser}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onRetry={handleRetry}
          onReply={handleReply}
          onReact={(emoji) => toggleReaction(message.id, emoji)}
          onPin={handlePin}
          isPinned={isPinned}
          onStartThread={() => openThread(message.id)}
          onReport={() => setReportOpen(true)}
          onShare={handleShare}
          onForward={() => setForwardOpen(true)}
          isInThread={isInThread}
          onSelect={handleSelect}
        />
      )}

      {/* Select text dialog — popup textarea for partial copy */}
      <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("chat.actions.select")}</DialogTitle>
            <DialogDescription className="sr-only">Select text to copy</DialogDescription>
          </DialogHeader>
          <textarea
            ref={selectTextareaRef}
            readOnly
            value={message.content}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm select-text"
            rows={Math.min(Math.max(message.content.split("\n").length, 3), 12)}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Message</DialogTitle>
            <DialogDescription>Why are you reporting this message?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">Select a reason...</option>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="explicit">Explicit / NSFW</option>
              <option value="misinformation">Misinformation</option>
              <option value="hate_speech">Hate Speech</option>
              <option value="other">Other</option>
            </select>
            <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} placeholder="Additional details (optional)" className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={3} maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReport} disabled={!reportReason || reportLoading}>
              {reportLoading ? "Reporting..." : "Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareSheet open={shareSheetOpen} onOpenChange={setShareSheetOpen} content={shareContent} />
      <ForwardDialog open={forwardOpen} onOpenChange={setForwardOpen} messageId={message.id} />
    </div>
  );
});
