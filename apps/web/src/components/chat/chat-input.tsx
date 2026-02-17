"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Paperclip, X, FileText, ImageIcon } from "lucide-react";
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

// ---------- Component ----------

export function ChatInput() {
  const [value, setValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
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

  // Get the active conversation's agentId (only for direct conversations)
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );
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

  // ---------- Command execution ----------

  const clearInput = useCallback(() => {
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, []);

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

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

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
      // Add the uploaded message to the store
      const store = useChatStore.getState();
      const current = store.messagesByConversation[activeConversationId] ?? [];
      useChatStore.setState({
        messagesByConversation: {
          ...store.messagesByConversation,
          [activeConversationId]: [...current, data.message],
        },
      });

      setSelectedFile(null);

      // If there's also text, send it as a separate message
      const trimmed = value.trim();
      if (trimmed) {
        sendMessage(trimmed);
        clearInput();
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, activeConversationId, value, sendMessage, clearInput]);

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
    setValue(e.target.value);
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
            className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-neutral-900 shadow-lg"
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
                        ? "bg-neutral-800 text-foreground"
                        : "text-muted-foreground hover:bg-neutral-800/50"
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
                      ? "bg-neutral-800 text-foreground"
                      : "text-muted-foreground hover:bg-neutral-800/50"
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
            placeholder="Type a message..."
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
