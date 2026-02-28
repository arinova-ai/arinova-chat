"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Paperclip, Smile, X, FileText, ImageIcon, Mic } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VoiceRecorder } from "./voice-recorder";
import { useChatStore } from "@/store/chat-store";
import { useRouter } from "next/navigation";
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
import type { Message } from "@arinova/shared/types";
import { useToastStore } from "@/store/toast-store";
import { MentionPopup, type MentionItem } from "./mention-popup";

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

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type);
}

interface ChatInputProps {
  droppedFile?: File | null;
  onDropHandled?: () => void;
}

// ---------- Component ----------

export function ChatInput({ droppedFile, onDropHandled }: ChatInputProps = {}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [stickers, setStickers] = useState<Array<{ id: string; filename: string; emoji: string }>>([]);
  const [selectedSticker, setSelectedSticker] = useState<{ id: string; filename: string; emoji: string } | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const sendMessage = useChatStore((s) => s.sendMessage);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const agentSkills = useChatStore((s) => s.agentSkills);
  const loadAgentSkills = useChatStore((s) => s.loadAgentSkills);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const insertSystemMessage = useChatStore((s) => s.insertSystemMessage);
  const clearConversation = useChatStore((s) => s.clearConversation);
  const getConversationStatus = useChatStore((s) => s.getConversationStatus);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const ttsEnabled = useChatStore((s) => s.ttsEnabled);
  const setTtsEnabled = useChatStore((s) => s.setTtsEnabled);
  const conversationMembers = useChatStore((s) => s.conversationMembers);
  const inputDrafts = useChatStore((s) => s.inputDrafts);
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const clearInputDraft = useChatStore((s) => s.clearInputDraft);

  // Get the active conversation
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  // Dynamic placeholder based on mentionOnly setting
  const placeholder =
    activeConversation?.type === "group" && activeConversation.mentionOnly
      ? "@mention an agent..."
      : "Type a message...";

  // Get the active conversation's agentId (only for direct conversations)
  const agentId =
    activeConversation?.type === "direct" ? activeConversation.agentId : null;

  // Get quick replies for the active agent
  const activeAgent = agentId ? agents.find((a) => a.id === agentId) : null;
  const quickReplies = activeAgent?.quickReplies ?? [];

  // Load skills when agentId is available
  useEffect(() => {
    if (agentId) {
      loadAgentSkills(agentId);
    }
  }, [agentId, loadAgentSkills]);

  // Handle file dropped from ChatArea drag-and-drop
  useEffect(() => {
    if (!droppedFile) return;
    if (isAcceptedFile(droppedFile)) {
      setSelectedFile(droppedFile);
    } else {
      useToastStore.getState().addToast("Unsupported file type");
    }
    onDropHandled?.();
  }, [droppedFile, onDropHandled]);

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
              s.id.toLowerCase().includes(q) ||
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q)
          )
        : skills;

      if (filteredSkills.length > 0) {
        items.push({
          type: "header",
          id: "header-agent-skills",
          label: "AGENT SKILLS",
        });

        for (const skill of filteredSkills) {
          items.push({
            type: "agent-skill",
            id: `skill-${skill.id}`,
            label: `/${skill.id}`,
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
    activeConversation?.type === "group" && activeConversation.mentionOnly;

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
        case "help": {
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
        case "clear": {
          if (activeConversationId) {
            clearConversation(activeConversationId);
          }
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
        case "reset": {
          if (activeConversationId) {
            clearConversation(activeConversationId);
          }
          break;
        }
        case "tts": {
          const on = args === "on" || (args !== "off" && !ttsEnabled);
          setTtsEnabled(on);
          insertSystemMessage(`Text-to-speech ${on ? "enabled" : "disabled"}.`);
          break;
        }
        case "settings": {
          router.push("/settings");
          break;
        }
        case "search": {
          if (args) {
            setSearchQuery(args);
          } else {
            insertSystemMessage("Usage: `/search [query]`");
          }
          break;
        }
        case "whoami": {
          insertSystemMessage("Use `/settings` to view your profile information.");
          break;
        }
        // "forward" commands: send as message to agent
        case "model":
        case "think":
        case "reasoning":
        case "verbose":
        case "compact": {
          if (!agentId) {
            insertSystemMessage(`Cannot use \`/${cmd.id}\` — no agent in this conversation.`);
          } else {
            sendMessage(`/${cmd.id}${args ? " " + args : ""}`);
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
      clearConversation,
      cancelStream,
      getConversationStatus,
      setSearchQuery,
      setTtsEnabled,
      sendMessage,
      router,
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
        // Agent skill: strip the "skill-" prefix we added
        const skillId = item.id.replace(/^skill-/, "");
        sendMessage(`/${skillId}`);
        clearInput();
      }
    },
    [executePlatformCommand, sendMessage, clearInput]
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
    if (!selectedFile || !activeConversationId) return;

    const trimmed = value.trim();
    const prevFile = selectedFile;

    // Create data URL for instant image preview in optimistic message
    let previewUrl: string | undefined;
    if (prevFile.type.startsWith("image/")) {
      previewUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(prevFile);
      });
    }

    // Optimistic message so it shows immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      seq: 0,
      conversationId: activeConversationId,
      role: "user",
      content: trimmed,
      status: "completed",
      senderUserId: useChatStore.getState().currentUserId ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(previewUrl
        ? {
            attachments: [
              {
                id: `temp-att-${Date.now()}`,
                messageId: tempId,
                fileName: prevFile.name,
                fileType: prevFile.type,
                fileSize: prevFile.size,
                url: previewUrl,
                createdAt: new Date(),
              },
            ],
          }
        : {}),
    };
    const store = useChatStore.getState();
    const current = store.messagesByConversation[activeConversationId] ?? [];
    useChatStore.setState({
      messagesByConversation: {
        ...store.messagesByConversation,
        [activeConversationId]: [...current, optimisticMsg],
      },
    });

    const prevValue = value;
    setSelectedFile(null);
    clearInput();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", prevFile);

      // Include text as caption so backend combines them into one message
      if (trimmed) {
        formData.append("caption", trimmed);
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
        throw new Error(body.error ?? "Upload failed");
      }

      // Promote the optimistic message with real data from the server
      const json = await res.json();
      const realMsg = json?.message;
      if (realMsg?.id) {
        const s2 = useChatStore.getState();
        const msgs2 = s2.messagesByConversation[activeConversationId] ?? [];
        const alreadyHasReal = msgs2.some((m) => m.id === realMsg.id);
        if (alreadyHasReal) {
          // WS already delivered the real message — just remove the temp
          useChatStore.setState({
            messagesByConversation: {
              ...s2.messagesByConversation,
              [activeConversationId]: msgs2.filter((m) => m.id !== tempId),
            },
          });
        } else {
          // Promote temp → real
          useChatStore.setState({
            messagesByConversation: {
              ...s2.messagesByConversation,
              [activeConversationId]: msgs2.map((m) =>
                m.id === tempId
                  ? {
                      ...m,
                      id: realMsg.id,
                      seq: realMsg.seq,
                      senderUserId: realMsg.senderUserId ?? m.senderUserId,
                      attachments: realMsg.attachments?.map((a: Record<string, unknown>) => ({
                        id: a.id as string,
                        messageId: a.messageId as string,
                        fileName: a.fileName as string,
                        fileType: a.fileType as string,
                        fileSize: a.fileSize as number,
                        url: a.url as string,
                        duration: a.duration as number | undefined,
                        createdAt: new Date(a.createdAt as string),
                      })) ?? m.attachments,
                      updatedAt: new Date(realMsg.updatedAt),
                    }
                  : m
              ),
            },
          });
        }
      }
    } catch (err) {
      console.error("Upload failed:", err);
      // Remove optimistic message and restore input on failure
      const s = useChatStore.getState();
      const msgs = s.messagesByConversation[activeConversationId] ?? [];
      useChatStore.setState({
        messagesByConversation: {
          ...s.messagesByConversation,
          [activeConversationId]: msgs.filter((m) => m.id !== tempId),
        },
      });
      setSelectedFile(prevFile);
      setValue(prevValue);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, activeConversationId, value, clearInput]);

  const handleVoiceUpload = useCallback(
    async (blob: Blob, durationSeconds?: number) => {
      setIsRecording(false);
      if (!activeConversationId) return;

      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, {
        type: blob.type,
      });

      // Optimistic message with audio attachment placeholder
      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        seq: 0,
        conversationId: activeConversationId,
        role: "user",
        content: "",
        status: "completed",
        senderUserId: useChatStore.getState().currentUserId ?? undefined,
        attachments: [
          {
            id: `temp-att-${Date.now()}`,
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
      const current = store.messagesByConversation[activeConversationId] ?? [];
      useChatStore.setState({
        messagesByConversation: {
          ...store.messagesByConversation,
          [activeConversationId]: [...current, optimisticMsg],
        },
      });

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (durationSeconds != null) {
          formData.append("duration_seconds", String(Math.round(durationSeconds)));
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
          throw new Error(body.error ?? "Upload failed");
        }

        // Promote temp → real using REST response
        const json = await res.json();
        const realMsg = json?.message;
        if (realMsg?.id) {
          const s2 = useChatStore.getState();
          const msgs2 = s2.messagesByConversation[activeConversationId] ?? [];
          const alreadyHasReal = msgs2.some((m) => m.id === realMsg.id);
          if (alreadyHasReal) {
            useChatStore.setState({
              messagesByConversation: {
                ...s2.messagesByConversation,
                [activeConversationId]: msgs2.filter((m) => m.id !== tempId),
              },
            });
          } else {
            useChatStore.setState({
              messagesByConversation: {
                ...s2.messagesByConversation,
                [activeConversationId]: msgs2.map((m) =>
                  m.id === tempId
                    ? {
                        ...m,
                        id: realMsg.id,
                        seq: realMsg.seq,
                        senderUserId: realMsg.senderUserId ?? m.senderUserId,
                        attachments: realMsg.attachments?.map((a: Record<string, unknown>) => ({
                          id: a.id as string,
                          messageId: a.messageId as string,
                          fileName: a.fileName as string,
                          fileType: a.fileType as string,
                          fileSize: a.fileSize as number,
                          url: a.url as string,
                          duration: a.duration as number | undefined,
                          createdAt: new Date(a.createdAt as string),
                        })) ?? m.attachments,
                        updatedAt: new Date(realMsg.updatedAt),
                      }
                    : m
                ),
              },
            });
          }
        }
      } catch (err) {
        console.error("Voice upload failed:", err);
        // Remove optimistic message on failure
        const s = useChatStore.getState();
        const msgs = s.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...s.messagesByConversation,
            [activeConversationId]: msgs.filter((m) => m.id !== tempId),
          },
        });
      } finally {
        setUploading(false);
      }
    },
    [activeConversationId]
  );

  // Sticker pack — fetch manifest once
  useEffect(() => {
    fetch("/stickers/arinova-pack-01/manifest.json")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.stickers) setStickers(data.stickers);
      })
      .catch(() => {});
  }, []);

  const handleStickerSend = useCallback(() => {
    if (!activeConversationId || !selectedSticker) return;
    sendMessage(`![sticker](/stickers/arinova-pack-01/${selectedSticker.filename})`);
    setStickerOpen(false);
    setSelectedSticker(null);
  }, [activeConversationId, sendMessage, selectedSticker]);

  const handleSend = useCallback(() => {
    if (selectedFile) {
      handleUpload();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) return;

    // Intercept platform commands
    if (tryExecuteSlashCommand(trimmed)) {
      clearInput();
      return;
    }

    sendMessage(trimmed);
    clearInput();
  }, [value, sendMessage, selectedFile, handleUpload, tryExecuteSlashCommand, clearInput]);

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
    if (activeConversationId) setInputDraft(activeConversationId, newValue);

    // Detect @mention trigger
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|\s)@(\w*)$/);
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
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const isImage = selectedFile?.type.startsWith("image/");

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

        {/* Quick reply buttons */}
        {quickReplies.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickReplies.map((qr, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  sendMessage(qr.message);
                }}
                className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground transition-colors hover:bg-accent"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* File preview */}
        {selectedFile && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
            {isImage ? (
              <ImageIcon className="h-4 w-4 text-blue-400" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="flex-1 truncate text-sm">{selectedFile.name}</span>
            <span className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(0)} KB
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSelectedFile(null)}
              className="text-muted-foreground hover:text-foreground"
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
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/json,audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav"
              onChange={handleFileSelect}
            />

            {/* Sticker picker */}
            {stickers.length > 0 && (
              <Popover open={stickerOpen} onOpenChange={(open) => { setStickerOpen(open); if (!open) setSelectedSticker(null); }}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-xl"
                    title={t("chat.stickers")}
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[320px] border-border bg-background p-2"
                  align="start"
                  sideOffset={8}
                  side="top"
                >
                  {/* Preview area */}
                  <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2 mb-2 min-h-[72px]">
                    {selectedSticker ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/stickers/arinova-pack-01/${selectedSticker.filename}`}
                          alt={selectedSticker.id}
                          className="h-16 w-16 object-contain shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{selectedSticker.emoji} {selectedSticker.id}</p>
                        </div>
                        <Button size="sm" className="shrink-0 gap-1.5" onClick={handleStickerSend}>
                          <SendHorizontal className="h-3.5 w-3.5" />
                          {t("common.send")}
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground w-full text-center">{t("chat.selectSticker")}</p>
                    )}
                  </div>

                  {/* Sticker grid */}
                  <div className="grid grid-cols-5 gap-1 max-h-[200px] overflow-y-auto">
                    {stickers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSticker(s)}
                        className={`rounded-lg p-1 transition-colors ${selectedSticker?.id === s.id ? "bg-accent ring-2 ring-brand" : "hover:bg-accent"}`}
                        title={s.emoji}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/stickers/arinova-pack-01/${s.filename}`}
                          alt={s.id}
                          className="h-12 w-12 object-contain"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>

                  {/* Pack tabs */}
                  <div className="flex items-center gap-1 border-t border-border mt-2 pt-2">
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs font-medium bg-accent text-foreground"
                      title="Arinova Pack 01"
                    >
                      {stickers[0]?.emoji ?? "🎨"}
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {value.trim() || selectedFile ? (
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
