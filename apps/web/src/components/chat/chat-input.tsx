"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Paperclip, X, FileText, ImageIcon } from "lucide-react";
import { useChatStore } from "@/store/chat-store";

const BACKEND_URL = "http://localhost:3501";

export function ChatInput() {
  const [value, setValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agentSkills = useChatStore((s) => s.agentSkills);
  const loadAgentSkills = useChatStore((s) => s.loadAgentSkills);

  // Get the active conversation's agentId (only for direct conversations)
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  const agentId =
    activeConversation?.type === "direct" ? activeConversation.agentId : null;

  // Load skills when agentId is available
  useEffect(() => {
    if (agentId) {
      loadAgentSkills(agentId);
    }
  }, [agentId, loadAgentSkills]);

  // Determine if slash popup should show
  const slashQuery = value.startsWith("/") ? value.slice(1) : null;
  const showSlashPopup = slashQuery !== null && agentId !== null;

  const filteredSkills = useMemo(() => {
    if (!showSlashPopup || !agentId) return [];
    const skills = agentSkills[agentId] ?? [];
    if (!slashQuery) return skills;
    const q = slashQuery.toLowerCase();
    return skills.filter(
      (s) =>
        s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [showSlashPopup, agentId, agentSkills, slashQuery]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [filteredSkills.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!showSlashPopup || !popupRef.current) return;
    const items = popupRef.current.querySelectorAll("[data-slash-item]");
    items[slashSelectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [slashSelectedIndex, showSlashPopup]);

  const selectSlashSkill = useCallback(
    (skillId: string) => {
      const text = `/${skillId}`;
      sendMessage(text);
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [sendMessage]
  );

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
        setValue("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, activeConversationId, value, sendMessage]);

  const handleSend = useCallback(() => {
    if (selectedFile) {
      handleUpload();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, sendMessage, selectedFile, handleUpload]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash popup keyboard navigation
    if (showSlashPopup && filteredSkills.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((prev) =>
          prev <= 0 ? filteredSkills.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((prev) =>
          prev >= filteredSkills.length - 1 ? 0 : prev + 1
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        selectSlashSkill(filteredSkills[slashSelectedIndex].id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setValue(`/${filteredSkills[slashSelectedIndex].id}`);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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

  return (
    <div className="shrink-0 border-t border-border p-4">
      <div className="relative mx-auto max-w-3xl">
        {/* Slash command popup */}
        {showSlashPopup && filteredSkills.length > 0 && (
          <div
            ref={popupRef}
            className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-neutral-900 shadow-lg"
          >
            {filteredSkills.map((skill, i) => (
              <button
                key={skill.id}
                data-slash-item
                type="button"
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === slashSelectedIndex
                    ? "bg-neutral-800 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-800/50"
                }`}
                onMouseEnter={() => setSlashSelectedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent textarea blur
                  selectSlashSkill(skill.id);
                }}
              >
                <span className="shrink-0 font-mono text-sm text-blue-400">
                  /{skill.id}
                </span>
                <span className="truncate text-sm">{skill.description}</span>
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
            placeholder="Type a message... (Shift+Enter for new line)"
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
