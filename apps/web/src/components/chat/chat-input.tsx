"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Paperclip, Smile, X, FileText, Mic, Reply, StickyNote, SquareKanban } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { VoiceRecorder } from "./voice-recorder";
import { ImageLightbox } from "./image-lightbox";
import { useChatStore } from "@/store/chat-store";
import {
  PLATFORM_COMMANDS,
  filterCommands,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  buildHelpText,
  type PlatformCommand,
  type CommandCategory,
} from "@/lib/platform-commands";
import { BACKEND_URL } from "@/lib/config";
import { api } from "@/lib/api";
import { isGroupLike } from "@/lib/utils";
import { compressImage } from "@/lib/image-compress";
import type { Message } from "@arinova/shared/types";
import { useToastStore } from "@/store/toast-store";
import { MentionPopup, type MentionItem } from "./mention-popup";
import { wsManager } from "@/lib/ws";
import { playSendSound } from "@/lib/sounds";
import { useInputHistory } from "@/hooks/use-input-history";
import { ChatTooltip } from "./chat-tooltip";

// ---------- Popup item types ----------

interface PopupHeaderItem {
  type: "header";
  id: string;
  label: string;
}

interface PopupCommandItem {
  type: "platform-command";
  id: string;
  label: string;
  description: string;
  args?: string;
  category: CommandCategory;
  command: PlatformCommand;
}

interface PopupSkillItem {
  type: "agent-skill";
  id: string;
  label: string;
  description: string;
}

type PopupItem = PopupHeaderItem | PopupCommandItem | PopupSkillItem;

const ACCEPTED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv", "application/json",
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type);
}

function isFileTooLarge(file: File): boolean {
  return file.size > MAX_FILE_SIZE;
}

interface ChatInputProps {
  droppedFiles?: File[] | null;
  onDropHandled?: () => void;
  stickerOpen?: boolean;
  onStickerToggle?: () => void;
  threadId?: string | null;
}

// ---------- File Preview Grid (memoised object URLs) ----------

function FilePreviewGrid({
  files,
  onRemove,
  onClearAll,
  label,
}: {
  files: File[];
  onRemove: (idx: number) => void;
  onClearAll: () => void;
  label: string;
}) {
  const previewUrls = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Build gallery list for lightbox (only image files)
  const galleryImages = useMemo(
    () => previewUrls
      .map((url, idx) => url ? { src: url, alt: files[idx].name } : null)
      .filter(Boolean) as { src: string; alt: string }[],
    [previewUrls, files],
  );

  // Map file index → gallery index for initialIndex
  const fileIdxToGalleryIdx = useMemo(() => {
    let gi = 0;
    return previewUrls.map((url) => url ? gi++ : -1);
  }, [previewUrls]);

  return (
    <div className="mb-2 space-y-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClearAll}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {files.map((file, idx) => (
          <div key={`${file.name}-${idx}`} className="relative group/thumb">
            {previewUrls[idx] ? (
              <ImageLightbox
                src={previewUrls[idx]}
                alt={file.name}
                className="h-16 w-full rounded-md object-cover cursor-zoom-in"
                images={galleryImages.length > 1 ? galleryImages : undefined}
                initialIndex={fileIdxToGalleryIdx[idx]}
              />
            ) : (
              <div className="flex h-16 w-full items-center justify-center rounded-md bg-secondary">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Component ----------

export function ChatInput({ droppedFiles, onDropHandled, stickerOpen, onStickerToggle, threadId }: ChatInputProps = {}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [stickerPacksLoaded, setStickerPacksLoaded] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef(0);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendThreadMessage = useChatStore((s) => s.sendThreadMessage);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const attachedCard = useChatStore((s) => s.attachedCard);
  const clearAttachedCard = useChatStore((s) => s.clearAttachedCard);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const agentSkills = useChatStore((s) => s.agentSkills);
  const loadAgentSkills = useChatStore((s) => s.loadAgentSkills);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const insertSystemMessage = useChatStore((s) => s.insertSystemMessage);
  const getConversationStatus = useChatStore((s) => s.getConversationStatus);
  const ttsEnabled = useChatStore((s) => s.ttsEnabled);
  const setTtsEnabled = useChatStore((s) => s.setTtsEnabled);
  const conversationMembers = useChatStore((s) => s.conversationMembers);
  const inputDrafts = useChatStore((s) => s.inputDrafts);
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const clearInputDraft = useChatStore((s) => s.clearInputDraft);
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const { addToHistory, navigateUp, navigateDown, resetNavigation, isNavigating } = useInputHistory();

  // Get the active conversation
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  // Dynamic placeholder based on mentionOnly setting
  const placeholder =
    isGroupLike(activeConversation?.type) && activeConversation?.mentionOnly
      ? "@mention an agent..."
      : "Type a message...";

  // Get the active conversation's agentId (only for direct conversations)
  const agentId =
    (activeConversation?.type === "h2a" || activeConversation?.type === "direct") ? activeConversation.agentId : null;


  // Load skills when agentId is available
  useEffect(() => {
    if (agentId) {
      loadAgentSkills(agentId);
    }
  }, [agentId, loadAgentSkills]);

  // Handle files dropped from ChatArea drag-and-drop
  useEffect(() => {
    if (!droppedFiles || droppedFiles.length === 0) return;
    const accepted = droppedFiles.filter(isAcceptedFile);
    const tooLarge = accepted.filter(isFileTooLarge);
    if (tooLarge.length > 0) {
      const names = tooLarge.map((f) => f.name).join(", ");
      useToastStore.getState().addToast(
        `${t("chat.fileTooLarge")}${names ? `: ${names}` : ""}`,
        "error",
      );
    }
    const validFiles = accepted.filter((f) => !isFileTooLarge(f));
    if (validFiles.length === 0) {
      if (accepted.length === 0) useToastStore.getState().addToast(t("chat.unsupportedFileType"), "error");
    } else {
      setPendingFiles((prev) => {
        const combined = [...prev, ...validFiles];
        if (combined.length > 9) {
          useToastStore.getState().addToast(t("chat.maxImages"));
          return combined.slice(0, 9);
        }
        return combined;
      });
    }
    onDropHandled?.();
  }, [droppedFiles, onDropHandled, t]);

  // Restore draft when switching conversations
  useEffect(() => {
    if (!activeConversationId) return;
    const draft = inputDrafts[activeConversationId] ?? "";
    setValue(draft);
    setMentionQuery(null);
    setMentionStart(-1);
    setMentionIndex(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      if (draft) {
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // ---------- Slash popup logic ----------

  // Extract the query part: text after `/` up to first space (for filtering)
  // If input is "/he", query is "he"; if "/help foo", query is "help" (command already typed)
  const slashQuery = value.startsWith("/") ? value.slice(1).split(" ")[0] : null;
  // Show popup when typing starts with `/` — no agentId restriction for platform commands
  const showSlashPopup = slashQuery !== null && !value.includes(" ");

  // Build the merged popup items list
  const popupItems = useMemo((): PopupItem[] => {
    if (!showSlashPopup) return [];

    const query = slashQuery ?? "";
    const items: PopupItem[] = [];

    // Platform commands grouped by category
    const filteredPlatform = filterCommands(PLATFORM_COMMANDS, query);

    for (const category of CATEGORY_ORDER) {
      const cmdsInCategory = filteredPlatform.filter((c) => c.category === category);
      if (cmdsInCategory.length === 0) continue;

      items.push({
        type: "header",
        id: `header-${category}`,
        label: CATEGORY_LABELS[category],
      });

      for (const cmd of cmdsInCategory) {
        items.push({
          type: "platform-command",
          id: cmd.id,
          label: `/${cmd.id}`,
          description: cmd.description,
          args: cmd.args,
          category: cmd.category,
          command: cmd,
        });
      }
    }

    // Agent skills section (only if agentId present)
    if (agentId) {
      const skills = agentSkills[agentId] ?? [];
      const q = query.toLowerCase();
      const filteredSkills = q
        ? skills.filter(
            (s) =>
              (s.slashCommand ?? s.id ?? "").toLowerCase().includes(q) ||
              (s.name ?? "").toLowerCase().includes(q) ||
              (s.description ?? "").toLowerCase().includes(q)
          )
        : skills;

      if (filteredSkills.length > 0) {
        items.push({
          type: "header",
          id: "header-agent-skills",
          label: "AGENT SKILLS",
        });

        for (const skill of filteredSkills) {
          const cmd = skill.slashCommand ?? skill.id;
          items.push({
            type: "agent-skill",
            id: `skill-${skill.id}`,
            label: cmd.startsWith("/") ? cmd : `/${cmd}`,
            description: skill.description,
          });
        }
      }
    }

    return items;
  }, [showSlashPopup, slashQuery, agentId, agentSkills]);

  // Selectable items (non-header) with their indices in the full list
  const selectableIndices = useMemo(
    () =>
      popupItems
        .map((item, i) => ({ item, index: i }))
        .filter((entry) => entry.item.type !== "header"),
    [popupItems]
  );

  const hasSelectableItems = selectableIndices.length > 0;

  // Reset selected index when popup items change
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [popupItems.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!showSlashPopup || !popupRef.current) return;
    const items = popupRef.current.querySelectorAll("[data-slash-item]");
    items[slashSelectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [slashSelectedIndex, showSlashPopup]);

  // ---------- @Mention popup logic ----------

  const activeMembers = activeConversationId
    ? conversationMembers[activeConversationId] ?? []
    : [];

  const isMentionOnly =
    isGroupLike(activeConversation?.type) && activeConversation?.mentionOnly;

  const mentionItems = useMemo((): MentionItem[] => {
    if (mentionQuery === null || activeMembers.length === 0) return [];
    const q = mentionQuery.toLowerCase();

    // Add @all as first item when mentionOnly is ON
    const allItem: MentionItem = { agentId: "__all__", agentName: "all" };
    const filtered = q
      ? activeMembers.filter((m) => m.agentName.toLowerCase().includes(q))
      : activeMembers;

    if (isMentionOnly) {
      const allMatches = !q || "all".includes(q);
      return allMatches ? [allItem, ...filtered] : filtered;
    }
    return filtered;
  }, [mentionQuery, activeMembers, isMentionOnly]);

  const showMentionPopup = mentionQuery !== null && mentionItems.length > 0;

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionItems.length]);

  // ---------- Command execution ----------

  const clearInput = useCallback(() => {
    setValue("");
    setPendingFiles([]);
    setMentionQuery(null);
    setMentionStart(-1);
    if (activeConversationId) clearInputDraft(activeConversationId);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [activeConversationId, clearInputDraft]);

  const selectMention = useCallback(
    (item: MentionItem) => {
      if (mentionStart < 0) return;
      const cursorPos = textareaRef.current?.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursorPos);
      const mention = `@${item.agentName} `;
      const newValue = `${before}${mention}${after}`;
      setValue(newValue);
      setMentionQuery(null);
      setMentionStart(-1);
      const newCursorPos = mentionStart + mention.length;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
          textareaRef.current.focus();
        }
      });
    },
    [value, mentionStart]
  );

  const executePlatformCommand = useCallback(
    (cmd: PlatformCommand, fullInput: string) => {
      // Extract args: everything after "/commandId "
      const prefixLen = cmd.id.length + 1; // +1 for the leading "/"
      const args = fullInput.length > prefixLen ? fullInput.slice(prefixLen).trim() : "";

      switch (cmd.id) {
        case "help":
        case "commands": {
          const currentSkills = agentId ? (agentSkills[agentId] ?? []) : [];
          const helpText = buildHelpText(currentSkills);
          insertSystemMessage(helpText);
          break;
        }
        case "new": {
          // Dispatch a custom event that the sidebar/dialog can listen to
          window.dispatchEvent(new CustomEvent("arinova:new-chat"));
          break;
        }
        case "stop": {
          cancelStream();
          break;
        }
        case "status": {
          const statusText = getConversationStatus();
          insertSystemMessage(statusText);
          break;
        }
case "tts": {
          const on = args === "on" || (args !== "off" && !ttsEnabled);
          setTtsEnabled(on);
          insertSystemMessage(`Text-to-speech ${on ? "enabled" : "disabled"}.`);
          break;
        }
        case "whoami": {
          insertSystemMessage("Check your profile in Settings.");
          break;
        }
        default: {
          // All "forward" commands: send as message to agent
          if (cmd.handler === "forward") {
            if (!agentId) {
              insertSystemMessage(`Cannot use \`/${cmd.id}\` — no agent in this conversation.`);
            } else {
              sendMessage(`/${cmd.id}${args ? " " + args : ""}`);
            }
          }
          break;
        }
      }
    },
    [
      agentId,
      agentSkills,
      activeConversationId,
      ttsEnabled,
      insertSystemMessage,
      cancelStream,
      getConversationStatus,
      setTtsEnabled,
      sendMessage,
    ]
  );

  // Select an item from the popup
  const selectPopupItem = useCallback(
    (item: PopupItem) => {
      if (item.type === "header") return;

      if (item.type === "platform-command") {
        const cmd = item.command;
        // Commands that need args: set input so user can type args
        if (cmd.args) {
          setValue(`/${cmd.id} `);
          textareaRef.current?.focus();
          return;
        }
        // No args needed: execute immediately
        executePlatformCommand(cmd, `/${cmd.id}`);
        clearInput();
        return;
      }

      if (item.type === "agent-skill") {
        // Fill input so user can add arguments before sending
        setValue(`${item.label} `);
        textareaRef.current?.focus();
      }
    },
    [executePlatformCommand]
  );

  // ---------- Intercept slash commands on send ----------

  const tryExecuteSlashCommand = useCallback(
    (text: string): boolean => {
      if (!text.startsWith("/")) return false;

      const withoutSlash = text.slice(1);
      const spaceIdx = withoutSlash.indexOf(" ");
      const cmdId = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);

      const cmd = PLATFORM_COMMANDS.find((c) => c.id === cmdId.toLowerCase());
      if (!cmd) return false; // Not a platform command — let it pass through

      executePlatformCommand(cmd, text);
      return true;
    },
    [executePlatformCommand]
  );

  // ---------- Upload & Send ----------

  const handleUpload = useCallback(async () => {
    if (pendingFiles.length === 0 || !activeConversationId) return;

    const trimmed = value.trim();
    const prevFiles = [...pendingFiles];

    // Create data URLs for instant image preview in optimistic message
    const previewAttachments = await Promise.all(
      prevFiles.map(async (f) => {
        if (f.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(f);
          });
          return {
            id: crypto.randomUUID(),
            fileName: f.name,
            fileType: f.type,
            fileSize: f.size,
            url: dataUrl,
          };
        }
        return null;
      })
    );
    const validPreviews = previewAttachments.filter(Boolean) as Array<{
      id: string; fileName: string; fileType: string; fileSize: number; url: string;
    }>;

    // Optimistic message so it shows immediately
    const effectiveThreadId = threadId ?? undefined;
    const tempId = crypto.randomUUID();
    const optimisticMsg: Message = {
      id: tempId,
      seq: 0,
      conversationId: activeConversationId,
      role: "user",
      content: trimmed,
      status: "completed",
      senderUserId: useChatStore.getState().currentUserId ?? undefined,
      threadId: effectiveThreadId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(validPreviews.length > 0
        ? {
            attachments: validPreviews.map((p) => ({
              ...p,
              messageId: tempId,
              createdAt: new Date(),
            })),
          }
        : {}),
    };
    const store = useChatStore.getState();
    if (effectiveThreadId) {
      const currentThread = store.threadMessages[effectiveThreadId] ?? [];
      useChatStore.setState({
        threadMessages: {
          ...store.threadMessages,
          [effectiveThreadId]: [...currentThread, optimisticMsg],
        },
      });
    } else {
      const current = store.messagesByConversation[activeConversationId] ?? [];
      useChatStore.setState({
        messagesByConversation: {
          ...store.messagesByConversation,
          [activeConversationId]: [...current, optimisticMsg],
        },
      });
    }

    const prevValue = value;
    setPendingFiles([]);
    clearInput();
    playSendSound();
    setUploading(true);
    try {
      const formData = new FormData();

      // Compress all image files in parallel
      const filesToUpload = await Promise.all(
        prevFiles.map((f) => compressImage(f))
      );
      for (const file of filesToUpload) {
        formData.append("file", file);
      }

      // Include text as caption so backend combines them into one message
      if (trimmed) {
        formData.append("caption", trimmed);
      }
      if (effectiveThreadId) {
        formData.append("thread_id", effectiveThreadId);
      }

      const res = await fetch(
        `${BACKEND_URL}/api/conversations/${activeConversationId}/upload`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = res.status === 413
          ? t("chat.fileTooLarge")
          : (body.error ?? t("chat.uploadFailed"));
        useToastStore.getState().addToast(msg);
        throw new Error(msg);
      }

      // Promote the optimistic message with real data from the server
      const json = await res.json();
      const realMsg = json?.message;
      if (realMsg?.id) {
        const s2 = useChatStore.getState();
        const promoteAttachments = (a: Record<string, unknown>) => ({
          id: a.id as string,
          messageId: a.messageId as string,
          fileName: a.fileName as string,
          fileType: a.fileType as string,
          fileSize: a.fileSize as number,
          url: a.url as string,
          duration: a.duration as number | undefined,
          createdAt: new Date(a.createdAt as string),
        });
        const promoteMsg = (m: Message) =>
          m.id === tempId
            ? {
                ...m,
                id: realMsg.id,
                seq: realMsg.seq,
                senderUserId: realMsg.senderUserId ?? m.senderUserId,
                attachments: realMsg.attachments?.map(promoteAttachments) ?? m.attachments,
                updatedAt: new Date(realMsg.updatedAt),
              }
            : m;

        if (effectiveThreadId) {
          const tmsgs = s2.threadMessages[effectiveThreadId] ?? [];
          const alreadyHasReal = tmsgs.some((m) => m.id === realMsg.id);
          useChatStore.setState({
            threadMessages: {
              ...s2.threadMessages,
              [effectiveThreadId]: alreadyHasReal
                ? tmsgs.filter((m) => m.id !== tempId)
                : tmsgs.map(promoteMsg),
            },
          });
        } else {
          const msgs2 = s2.messagesByConversation[activeConversationId] ?? [];
          const alreadyHasReal = msgs2.some((m) => m.id === realMsg.id);
          useChatStore.setState({
            messagesByConversation: {
              ...s2.messagesByConversation,
              [activeConversationId]: alreadyHasReal
                ? msgs2.filter((m) => m.id !== tempId)
                : msgs2.map(promoteMsg),
            },
          });
        }
      }
    } catch (err) {
      console.error("Upload failed:", err);
      // Remove optimistic message and restore input on failure
      const s = useChatStore.getState();
      if (effectiveThreadId) {
        const tmsgs = s.threadMessages[effectiveThreadId] ?? [];
        useChatStore.setState({
          threadMessages: {
            ...s.threadMessages,
            [effectiveThreadId]: tmsgs.filter((m) => m.id !== tempId),
          },
        });
      } else {
        const msgs = s.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...s.messagesByConversation,
            [activeConversationId]: msgs.filter((m) => m.id !== tempId),
          },
        });
      }
      setPendingFiles(prevFiles);
      setValue(prevValue);
    } finally {
      setUploading(false);
    }
  }, [pendingFiles, activeConversationId, value, clearInput, threadId]);

  const handleVoiceUpload = useCallback(
    async (blob: Blob, durationSeconds?: number) => {
      setIsRecording(false);
      if (!activeConversationId) return;

      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, {
        type: blob.type,
      });

      // Optimistic message with audio attachment placeholder
      const voiceThreadId = threadId ?? undefined;
      const tempId = crypto.randomUUID();
      const optimisticMsg: Message = {
        id: tempId,
        seq: 0,
        conversationId: activeConversationId,
        role: "user",
        content: "",
        status: "completed",
        senderUserId: useChatStore.getState().currentUserId ?? undefined,
        threadId: voiceThreadId,
        attachments: [
          {
            id: crypto.randomUUID(),
            messageId: tempId,
            fileName: file.name,
            fileType: file.type || "audio/webm",
            fileSize: file.size,
            url: "",
            duration: durationSeconds ? Math.round(durationSeconds) : undefined,
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const store = useChatStore.getState();
      if (voiceThreadId) {
        const currentThread = store.threadMessages[voiceThreadId] ?? [];
        useChatStore.setState({
          threadMessages: {
            ...store.threadMessages,
            [voiceThreadId]: [...currentThread, optimisticMsg],
          },
        });
      } else {
        const current = store.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...store.messagesByConversation,
            [activeConversationId]: [...current, optimisticMsg],
          },
        });
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (durationSeconds != null) {
          formData.append("duration_seconds", String(Math.round(durationSeconds)));
        }
        if (voiceThreadId) {
          formData.append("thread_id", voiceThreadId);
        }

        const res = await fetch(
          `${BACKEND_URL}/api/conversations/${activeConversationId}/upload`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = res.status === 413
            ? t("chat.fileTooLarge")
            : (body.error ?? t("chat.uploadFailed"));
          useToastStore.getState().addToast(msg);
          throw new Error(msg);
        }

        // Promote temp → real using REST response
        const json = await res.json();
        const realMsg = json?.message;
        if (realMsg?.id) {
          const s2 = useChatStore.getState();
          const promoteAttachments = (a: Record<string, unknown>) => ({
            id: a.id as string,
            messageId: a.messageId as string,
            fileName: a.fileName as string,
            fileType: a.fileType as string,
            fileSize: a.fileSize as number,
            url: a.url as string,
            duration: a.duration as number | undefined,
            createdAt: new Date(a.createdAt as string),
          });
          const promoteMsg = (m: Message) =>
            m.id === tempId
              ? {
                  ...m,
                  id: realMsg.id,
                  seq: realMsg.seq,
                  senderUserId: realMsg.senderUserId ?? m.senderUserId,
                  attachments: realMsg.attachments?.map(promoteAttachments) ?? m.attachments,
                  updatedAt: new Date(realMsg.updatedAt),
                }
              : m;

          if (voiceThreadId) {
            const tmsgs = s2.threadMessages[voiceThreadId] ?? [];
            const alreadyHasReal = tmsgs.some((m) => m.id === realMsg.id);
            useChatStore.setState({
              threadMessages: {
                ...s2.threadMessages,
                [voiceThreadId]: alreadyHasReal
                  ? tmsgs.filter((m) => m.id !== tempId)
                  : tmsgs.map(promoteMsg),
              },
            });
          } else {
            const msgs2 = s2.messagesByConversation[activeConversationId] ?? [];
            const alreadyHasReal = msgs2.some((m) => m.id === realMsg.id);
            useChatStore.setState({
              messagesByConversation: {
                ...s2.messagesByConversation,
                [activeConversationId]: alreadyHasReal
                  ? msgs2.filter((m) => m.id !== tempId)
                  : msgs2.map(promoteMsg),
              },
            });
          }
        }
      } catch (err) {
        console.error("Voice upload failed:", err);
        // Remove optimistic message on failure
        const s = useChatStore.getState();
        if (voiceThreadId) {
          const tmsgs = s.threadMessages[voiceThreadId] ?? [];
          useChatStore.setState({
            threadMessages: {
              ...s.threadMessages,
              [voiceThreadId]: tmsgs.filter((m) => m.id !== tempId),
            },
          });
        } else {
          const msgs = s.messagesByConversation[activeConversationId] ?? [];
          useChatStore.setState({
            messagesByConversation: {
              ...s.messagesByConversation,
              [activeConversationId]: msgs.filter((m) => m.id !== tempId),
            },
          });
        }
      } finally {
        setUploading(false);
      }
    },
    [activeConversationId, threadId]
  );

  // Check if user has sticker packs (for showing the sticker button)
  useEffect(() => {
    let cancelled = false;
    api<{ packs: Array<{ id: string }> }>("/api/user/stickers", { silent: true })
      .then((data) => {
        if (cancelled) return;
        setStickerPacksLoaded(data.packs.length > 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(() => {
    if (pendingFiles.length > 0) {
      handleUpload();
      return;
    }

    const trimmed = value.trim();
    const hasCard = !!attachedCard;

    // Nothing to send
    if (!trimmed && !hasCard) return;

    // Intercept platform commands (only when no card attached)
    if (!hasCard && trimmed && tryExecuteSlashCommand(trimmed)) {
      clearInput();
      return;
    }

    // Build card metadata for single-message send
    let cardMetadata: Record<string, unknown> | undefined;
    if (hasCard) {
      if (attachedCard.type === "note") {
        cardMetadata = {
          type: "note_share",
          noteId: attachedCard.id,
          title: attachedCard.title,
          preview: attachedCard.preview || "",
          tags: [],
        };
      } else if (attachedCard.type === "commit") {
        cardMetadata = {
          type: "commit_share",
          commitHash: attachedCard.id,
          title: attachedCard.title,
          preview: attachedCard.preview || "",
        };
      } else {
        cardMetadata = {
          type: "kanban_card",
          cardId: attachedCard.id,
          title: attachedCard.title,
          preview: attachedCard.preview || "",
        };
      }
      clearAttachedCard();
    }

    // Build content: always include card description so agents can read it
    let content = trimmed;
    if (hasCard) {
      const desc = attachedCard.type === "note"
        ? `[📝 Shared a note: ${attachedCard.title}]`
        : attachedCard.type === "commit"
          ? `[📦 Shared a commit: ${attachedCard.title}]`
          : `[📋 Shared a kanban card: ${attachedCard.title}]`;
      content = content ? `${desc}\n${content}` : desc;
    }

    if (!content) return;

    // Extract @mentions and resolve to agent IDs
    const mentionPattern = /@([\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]+)/g;
    const mentionIds = new Set<string>();
    let match;
    while ((match = mentionPattern.exec(trimmed)) !== null) {
      const name = match[1].toLowerCase();
      if (name === "all") continue;
      const member = activeMembers.find(
        (m) => m.agentName.toLowerCase() === name,
      );
      if (member?.agentId) mentionIds.add(member.agentId);
    }

    if (threadId) {
      sendThreadMessage(content);
    } else {
      sendMessage(content, mentionIds.size > 0 ? [...mentionIds] : undefined, cardMetadata);
    }
    addToHistory(trimmed || content);
    playSendSound();
    clearInput();
  }, [value, sendMessage, sendThreadMessage, threadId, pendingFiles, handleUpload, tryExecuteSlashCommand, clearInput, activeMembers, addToHistory, attachedCard, clearAttachedCard]);

  // ---------- Keyboard handling ----------

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // @Mention popup keyboard navigation
    if (showMentionPopup) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev <= 0 ? mentionItems.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev >= mentionItems.length - 1 ? 0 : prev + 1
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const item = mentionItems[mentionIndex];
        if (item) selectMention(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Slash popup keyboard navigation
    if (showSlashPopup && hasSelectableItems) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((prev) =>
          prev <= 0 ? selectableIndices.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((prev) =>
          prev >= selectableIndices.length - 1 ? 0 : prev + 1
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const entry = selectableIndices[slashSelectedIndex];
        if (entry) {
          selectPopupItem(entry.item);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const entry = selectableIndices[slashSelectedIndex];
        if (entry && entry.item.type !== "header") {
          const itemId =
            entry.item.type === "agent-skill"
              ? entry.item.id.replace(/^skill-/, "")
              : entry.item.id;
          setValue(`/${itemId}`);
        }
        return;
      }
    }

    // History navigation: ArrowUp/Down when input is empty or already navigating
    if (e.key === "ArrowUp" && (value === "" || isNavigating())) {
      const prev = navigateUp(value);
      if (prev !== null) {
        e.preventDefault();
        setValue(prev);
      }
      return;
    }
    if (e.key === "ArrowDown" && isNavigating()) {
      const next = navigateDown();
      if (next !== null) {
        e.preventDefault();
        setValue(next);
      }
      return;
    }

    // Desktop: Enter sends, Shift+Enter new line
    // Mobile: Enter always new line, send via button only
    const isMobile = window.innerWidth < 768;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isMobile) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    resetNavigation();
    if (activeConversationId) setInputDraft(activeConversationId, newValue);

    // Send typing indicator (debounced to every 3 seconds)
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000 && activeConversationId) {
      lastTypingSentRef.current = now;
      wsManager.send({ type: "typing", conversationId: activeConversationId });
    }

    // Detect @mention trigger
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|\s)@([\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]*)$/);
    if (atMatch && activeMembers.length > 0) {
      setMentionQuery(atMatch[2]);
      setMentionStart(cursorPos - atMatch[2].length - 1); // position of @
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }

    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter(isAcceptedFile);
    if (accepted.length === 0) {
      useToastStore.getState().addToast(t("chat.unsupportedFileType"), "error");
      e.target.value = "";
      return;
    }
    const tooLarge = accepted.filter(isFileTooLarge);
    if (tooLarge.length > 0) {
      const names = tooLarge.map((f) => f.name).join(", ");
      useToastStore.getState().addToast(
        `${t("chat.fileTooLarge")}${names ? `: ${names}` : ""}`,
        "error",
      );
    }
    const validFiles = accepted.filter((f) => !isFileTooLarge(f));
    if (validFiles.length === 0) { e.target.value = ""; return; }
    setPendingFiles((prev) => {
      const combined = [...prev, ...validFiles];
      if (combined.length > 9) {
        useToastStore.getState().addToast(t("chat.maxImages"));
        return combined.slice(0, 9);
      }
      return combined;
    });
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  // ---------- Render ----------

  // Track which selectable index each non-header item maps to
  let selectableCounter = 0;

  return (
    <div className="shrink-0 border-t border-border p-4 pb-[max(1.125rem,calc(env(safe-area-inset-bottom,1rem)+2px))]">
      <div className="relative mx-auto max-w-3xl">
        {/* Slash command popup */}
        {showSlashPopup && hasSelectableItems && (
          <div
            ref={popupRef}
            className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
          >
            {(() => {
              selectableCounter = 0;
              return null;
            })()}
            {popupItems.map((item) => {
              if (item.type === "header") {
                return (
                  <div
                    key={item.id}
                    className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60"
                  >
                    {item.label}
                  </div>
                );
              }

              const currentSelectableIndex = selectableCounter;
              selectableCounter++;
              const isSelected = currentSelectableIndex === slashSelectedIndex;

              if (item.type === "platform-command") {
                return (
                  <button
                    key={item.id}
                    data-slash-item
                    type="button"
                    className={`flex w-full items-start gap-3 px-4 py-2 text-left transition-colors ${
                      isSelected
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                    onMouseEnter={() => setSlashSelectedIndex(currentSelectableIndex)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectPopupItem(item);
                    }}
                  >
                    <span className="shrink-0 font-mono text-sm text-blue-400">
                      /{item.id}
                    </span>
                    {item.args && (
                      <span className="shrink-0 font-mono text-sm text-muted-foreground/50">
                        {item.args}
                      </span>
                    )}
                    <span className="truncate text-sm">{item.description}</span>
                  </button>
                );
              }

              // agent-skill
              return (
                <button
                  key={item.id}
                  data-slash-item
                  type="button"
                  className={`flex w-full items-start gap-3 px-4 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                  onMouseEnter={() => setSlashSelectedIndex(currentSelectableIndex)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectPopupItem(item);
                  }}
                >
                  <span className="shrink-0 font-mono text-sm text-emerald-400">
                    {item.label}
                  </span>
                  <span className="truncate text-sm">{item.description}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* @Mention popup */}
        {showMentionPopup && (
          <MentionPopup
            items={mentionItems}
            selectedIndex={mentionIndex}
            onSelect={selectMention}
            onHover={setMentionIndex}
          />
        )}

        {/* Reply preview bar */}
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
            <Reply className="h-4 w-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1 border-l-2 border-brand pl-2">
              <p className="text-xs font-medium text-brand">
                {replyingTo.senderAgentName ?? "You"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {replyingTo.content.length > 120
                  ? replyingTo.content.slice(0, 120) + "…"
                  : replyingTo.content}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setReplyingTo(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* File preview grid */}
        {pendingFiles.length > 0 && (
          <FilePreviewGrid
            files={pendingFiles}
            onRemove={(idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
            onClearAll={() => setPendingFiles([])}
            label={t("chat.imageCount").replace("{n}", String(pendingFiles.length)).replace("{max}", "9")}
          />
        )}

        {/* Attached card preview */}
        {attachedCard && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
            {attachedCard.type === "note" ? (
              <StickyNote className="h-4 w-4 shrink-0 text-brand" />
            ) : (
              <SquareKanban className="h-4 w-4 shrink-0 text-brand" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{attachedCard.title}</p>
              {attachedCard.preview && (
                <p className="text-xs text-muted-foreground truncate">{attachedCard.preview}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearAttachedCard}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {isRecording ? (
          <div className="flex items-end gap-2">
            <VoiceRecorder
              onRecordingComplete={(blob, duration) => handleVoiceUpload(blob, duration)}
              onCancel={() => setIsRecording(false)}
            />
          </div>
        ) : (
          <div className="flex items-end gap-2">
            {/* File upload button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 w-11 shrink-0 rounded-xl"
              title="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/json,audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav"
              onChange={handleFileSelect}
            />

            {/* Sticker picker toggle */}
            {stickerPacksLoaded && onStickerToggle && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onStickerToggle}
                className={`h-11 w-11 shrink-0 rounded-xl ${stickerOpen ? "bg-accent ring-2 ring-brand" : ""}`}
                title={t("chat.stickers")}
              >
                <Smile className="h-5 w-5" />
              </Button>
            )}

            <div className="relative flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={1}
                className="block w-full resize-none rounded-xl border border-input bg-secondary px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="absolute right-2 bottom-3">
                <ChatTooltip />
              </div>
            </div>

            {value.trim() || pendingFiles.length > 0 || attachedCard ? (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={uploading}
                className="brand-gradient-btn h-11 w-11 shrink-0 rounded-xl"
              >
                <SendHorizontal className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => setIsRecording(true)}
                disabled={uploading}
                className="h-11 w-11 shrink-0 rounded-xl bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent"
                title="Record voice message"
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
