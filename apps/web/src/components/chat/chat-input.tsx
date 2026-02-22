"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Paperclip, X, FileText, ImageIcon } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { BACKEND_URL } from "@/lib/config";
import { ReplyPreview } from "./reply-preview";
import { MentionPopup, type MentionItem } from "./mention-popup";

// ---------- Popup item types ----------

interface SkillItem {
  id: string;
  label: string;
  description: string;
}

// ---------- Component ----------

export function ChatInput() {
  const [value, setValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const isKeyboardNav = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const agentSkills = useChatStore((s) => s.agentSkills);
  const loadAgentSkills = useChatStore((s) => s.loadAgentSkills);
  const conversationMembers = useChatStore((s) => s.conversationMembers);

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

  // ---------- Slash popup logic ----------

  const slashQuery = value.startsWith("/") ? value.slice(1).split(" ")[0] : null;
  const showSlashPopup = slashQuery !== null && !value.includes(" ") && !!agentId;

  // Build skill items for the popup
  const skillItems = useMemo((): SkillItem[] => {
    if (!showSlashPopup || !agentId) return [];

    const skills = agentSkills[agentId] ?? [];
    const q = (slashQuery ?? "").toLowerCase();
    const filtered = q
      ? skills.filter(
          (s) =>
            s.id.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q)
        )
      : skills;

    return filtered.map((s) => ({
      id: s.id,
      label: `/${s.id}`,
      description: s.description,
    }));
  }, [showSlashPopup, slashQuery, agentId, agentSkills]);

  const hasItems = skillItems.length > 0;

  // Reset selected index when items change
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [skillItems.length]);

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

  // ---------- Helpers ----------

  const clearInput = useCallback(() => {
    setValue("");
    setMentionedIds([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, []);

  const selectSkill = useCallback(
    (item: SkillItem) => {
      sendMessage(`/${item.id}`);
      clearInput();
    },
    [sendMessage, clearInput]
  );

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
      // Track mentioned agent ID (avoid duplicates)
      if (!mentionedIds.includes(item.agentId)) {
        setMentionedIds((prev) => [...prev, item.agentId]);
      }
      const newCursorPos = mentionStart + mention.length;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
          textareaRef.current.focus();
        }
      });
    },
    [value, mentionStart, mentionedIds]
  );

  // ---------- Upload & Send ----------

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !activeConversationId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const trimmed = value.trim();
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

      const data = await res.json();
      const store = useChatStore.getState();
      const current = store.messagesByConversation[activeConversationId] ?? [];
      useChatStore.setState({
        messagesByConversation: {
          ...store.messagesByConversation,
          [activeConversationId]: [...current, data.message],
        },
      });

      setSelectedFile(null);
      clearInput();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, activeConversationId, value, clearInput]);

  const handleSend = useCallback(() => {
    if (selectedFile) {
      handleUpload();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) return;

    sendMessage(trimmed, mentionedIds.length > 0 ? mentionedIds : undefined);
    clearInput();
  }, [value, sendMessage, selectedFile, handleUpload, clearInput, mentionedIds]);

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
    if (showSlashPopup && hasItems) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        isKeyboardNav.current = true;
        setSlashSelectedIndex((prev) =>
          prev <= 0 ? skillItems.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        isKeyboardNav.current = true;
        setSlashSelectedIndex((prev) =>
          prev >= skillItems.length - 1 ? 0 : prev + 1
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const item = skillItems[slashSelectedIndex];
        if (item) {
          selectSkill(item);
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
        const item = skillItems[slashSelectedIndex];
        if (item) {
          setValue(`/${item.id}`);
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

    // Detect @mention trigger — find last @ preceded by start or whitespace
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|\s)@([^@]*)$/);
    if (atMatch && activeMembers.length > 0) {
      const query = atMatch[2];
      // Close popup if query ends with two consecutive spaces (user moved on)
      if (query.endsWith("  ")) {
        setMentionQuery(null);
        setMentionStart(-1);
      } else {
        setMentionQuery(query);
        setMentionStart(cursorPos - query.length - 1); // position of @
      }
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
    e.target.value = "";
  };

  const isImage = selectedFile?.type.startsWith("image/");

  // ---------- Render ----------

  return (
    <div className="shrink-0 border-t border-border p-4 pb-[max(1.125rem,calc(env(safe-area-inset-bottom,1rem)+2px))]">
      <div className="relative mx-auto max-w-3xl">
        {/* Slash popup — agent skills only */}
        {showSlashPopup && hasItems && (
          <div
            ref={popupRef}
            className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-neutral-900 shadow-lg"
          >
            <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              AGENT SKILLS
            </div>
            {skillItems.map((item, i) => {
              const isSelected = i === slashSelectedIndex;
              return (
                <button
                  key={item.id}
                  data-slash-item
                  type="button"
                  className={`flex w-full items-start gap-3 px-4 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-neutral-800 text-foreground"
                      : "text-muted-foreground hover:bg-neutral-800/50"
                  }`}
                  onMouseMove={() => {
                    isKeyboardNav.current = false;
                    setSlashSelectedIndex(i);
                  }}
                  onMouseEnter={() => {
                    if (!isKeyboardNav.current) setSlashSelectedIndex(i);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSkill(item);
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

        {/* Reply preview */}
        <ReplyPreview />

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
                className="rounded-full border border-border bg-neutral-800 px-3 py-1 text-xs text-foreground transition-colors hover:bg-neutral-700"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* File preview */}
        {selectedFile && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2">
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
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/json"
            onChange={handleFileSelect}
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-neutral-800 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!value.trim() && !selectedFile) || uploading}
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            <SendHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
