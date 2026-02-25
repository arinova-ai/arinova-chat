"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Plus, Trash2, Upload, X } from "lucide-react";

const CATEGORIES = [
  "Productivity",
  "Development",
  "Education",
  "Creative",
  "Analytics",
  "Support",
  "Other",
];

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

interface KbFile {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  createdAt: string;
}

interface AgentManage {
  id: string;
  agentName: string;
  description: string;
  avatarUrl: string | null;
  category: string;
  systemPrompt: string;
  welcomeMessage: string | null;
  exampleConversations: { question: string; answer: string }[];
  modelProvider: string;
  modelId: string;
  pricePerMessage: number;
  freeTrialMessages: number;
  status: string;
}

function EditAgentContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [category, setCategory] = useState("other");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [modelProvider, setModelProvider] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pricePerMessage, setPricePerMessage] = useState(1);
  const [freeTrialMessages, setFreeTrialMessages] = useState(3);
  const [exampleConversations, setExampleConversations] = useState<
    { question: string; answer: string }[]
  >([]);
  const [kbFiles, setKbFiles] = useState<KbFile[]>([]);
  const [newKbFiles, setNewKbFiles] = useState<File[]>([]);
  const [uploadingKb, setUploadingKb] = useState(false);
  const [kbError, setKbError] = useState("");

  const ALLOWED_KB_EXTENSIONS = ["txt", "md", "csv", "json"];
  const MAX_KB_FILE_SIZE = 5 * 1024 * 1024;

  const validateAndAddKbFiles = (files: FileList) => {
    setKbError("");
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_KB_EXTENSIONS.includes(ext)) {
        rejected.push(`${file.name}: unsupported type (.${ext})`);
      } else if (file.size > MAX_KB_FILE_SIZE) {
        rejected.push(`${file.name}: exceeds 5 MB limit`);
      } else {
        accepted.push(file);
      }
    }
    if (accepted.length > 0) {
      setNewKbFiles((prev) => [...prev, ...accepted]);
    }
    if (rejected.length > 0) {
      setKbError(rejected.join("; "));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await api<AgentManage>(
          `/api/marketplace/agents/${id}/manage`,
        );
        setName(data.agentName);
        setDescription(data.description);
        setAvatarUrl(data.avatarUrl ?? "");
        setCategory(data.category);
        setSystemPrompt(data.systemPrompt);
        setWelcomeMessage(data.welcomeMessage ?? "");
        setModelProvider(data.modelProvider);
        setModelId(data.modelId);
        setPricePerMessage(data.pricePerMessage);
        setFreeTrialMessages(data.freeTrialMessages);
        setExampleConversations(data.exampleConversations ?? []);
        // Load KB files
        try {
          const kb = await api<{ files: KbFile[] }>(
            `/api/marketplace/agents/${id}/knowledge-base`,
          );
          setKbFiles(kb.files);
        } catch {
          // KB may not exist yet
        }
      } catch {
        // auto-handled
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const addExample = () => {
    setExampleConversations([
      ...exampleConversations,
      { question: "", answer: "" },
    ]);
  };

  const updateExample = (
    idx: number,
    field: "question" | "answer",
    value: string,
  ) => {
    setExampleConversations((prev) =>
      prev.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex)),
    );
  };

  const removeExample = (idx: number) => {
    setExampleConversations((prev) => prev.filter((_, i) => i !== idx));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-green-500/10 text-green-500";
      case "processing":
        return "bg-yellow-500/10 text-yellow-500";
      case "failed":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleDeleteKb = async (kbId: string) => {
    try {
      await api(`/api/marketplace/agents/${id}/knowledge-base/${kbId}`, {
        method: "DELETE",
      });
      setKbFiles((prev) => prev.filter((f) => f.id !== kbId));
    } catch {
      // auto-handled
    }
  };

  const handleUploadKb = async () => {
    if (newKbFiles.length === 0) return;
    setUploadingKb(true);
    try {
      for (const file of newKbFiles) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const uploaded = await api<KbFile>(
            `/api/marketplace/agents/${id}/knowledge-base`,
            { method: "POST", body: fd },
          );
          setKbFiles((prev) => [uploaded, ...prev]);
        } catch {
          // continue uploading remaining files
        }
      }
      setNewKbFiles([]);
    } finally {
      setUploadingKb(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/marketplace/agents/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          description,
          avatarUrl: avatarUrl || undefined,
          category,
          systemPrompt,
          welcomeMessage: welcomeMessage || undefined,
          exampleConversations: exampleConversations.filter(
            (ex) => ex.question.trim() && ex.answer.trim(),
          ),
          modelProvider,
          modelId,
          ...(apiKey ? { apiKey } : {}),
          pricePerMessage,
          freeTrialMessages,
        }),
      });
      router.push("/creator");
    } catch {
      // auto-handled
    } finally {
      setSaving(false);
    }
  };

  const isValid =
    name.trim() && description.trim() && systemPrompt.trim() && modelId.trim();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push("/creator")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Edit Agent</h1>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-2xl space-y-6"
          >
            {/* Basic info */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Basic Info
              </h2>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Avatar URL</label>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c.toLowerCase()}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

            </section>

            {/* AI Config */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                AI Configuration
              </h2>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">System Prompt *</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Welcome Message</label>
                <input
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Provider *</label>
                  <select
                    value={modelProvider}
                    onChange={(e) => setModelProvider(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Model ID *</label>
                  <input
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  API Key (leave empty to keep current)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-[10px] text-muted-foreground">
                  Only fill this in if you want to replace the existing key.
                </p>
              </div>
            </section>

            {/* Knowledge Base */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Knowledge Base
              </h2>
              <p className="text-xs text-muted-foreground">
                Upload files to give your agent domain-specific knowledge via RAG.
                Supported: .txt, .md, .csv, .json (max 5 MB each).
                Each file upload costs 10 credits.
              </p>

              {/* Existing files */}
              {kbFiles.length > 0 && (
                <div className="space-y-2">
                  {kbFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm truncate">{f.fileName}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(f.status)}`}
                          >
                            {f.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(f.fileSize)}
                          {f.status === "ready" && f.chunkCount > 0 && (
                            <> &middot; {f.chunkCount} chunks</>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteKb(f.id)}
                        className="text-muted-foreground hover:text-red-500 shrink-0 ml-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload new files */}
              <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 cursor-pointer hover:border-muted-foreground transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Click to select files
                </span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      validateAndAddKbFiles(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
              </label>

              {kbError && (
                <p className="text-xs text-red-500">{kbError}</p>
              )}

              {newKbFiles.length > 0 && (
                <div className="space-y-2">
                  {newKbFiles.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{f.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(f.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewKbFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={uploadingKb}
                    onClick={handleUploadKb}
                    className="text-xs gap-1"
                  >
                    {uploadingKb ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload {newKbFiles.length} file{newKbFiles.length !== 1 ? "s" : ""}
                  </Button>
                </div>
              )}
            </section>

            {/* Pricing */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Pricing
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Credits per Message
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pricePerMessage}
                    onChange={(e) =>
                      setPricePerMessage(parseInt(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Free Trial Messages
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={freeTrialMessages}
                    onChange={(e) =>
                      setFreeTrialMessages(parseInt(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </section>

            {/* Example Conversations */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Example Conversations
                </h2>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addExample}
                  className="text-xs gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {exampleConversations.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add example Q&A pairs to showcase your agent.
                </p>
              )}

              {exampleConversations.map((ex, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Example {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeExample(i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={ex.question}
                    onChange={(e) => updateExample(i, "question", e.target.value)}
                    placeholder="User question..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <textarea
                    value={ex.answer}
                    onChange={(e) => updateExample(i, "answer", e.target.value)}
                    placeholder="Agent answer..."
                    rows={2}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </section>

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/creator")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || saving}
                className="brand-gradient-btn flex-1"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function EditAgentPage() {
  return (
    <AuthGuard>
      <EditAgentContent />
    </AuthGuard>
  );
}
