"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Plus, Upload, X } from "lucide-react";

const CATEGORY_KEYS = [
  "productivity",
  "development",
  "education",
  "creative",
  "analytics",
  "support",
  "other",
];

const MODELS = [
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
  { value: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
];

function NewAgentContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [category, setCategory] = useState("other");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [inputCharLimit, setInputCharLimit] = useState(2000);
  const [pricePerMessage, setPricePerMessage] = useState(1);
  const [freeTrialMessages, setFreeTrialMessages] = useState(3);
  const [exampleConversations, setExampleConversations] = useState<
    { question: string; answer: string }[]
  >([]);
  const [kbFiles, setKbFiles] = useState<File[]>([]);
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
      setKbFiles((prev) => [...prev, ...accepted]);
    }
    if (rejected.length > 0) {
      setKbError(rejected.join("; "));
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clampedCharLimit = Math.max(1, Math.min(20000, inputCharLimit));
    setInputCharLimit(clampedCharLimit);
    setSaving(true);
    try {
      const created = await api<{ id: string }>("/api/agent-hub/agents", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          ...(avatarUrl ? { avatarUrl } : {}),
          category,
          systemPrompt,
          exampleConversations: exampleConversations.filter(
            (ex) => ex.question.trim() && ex.answer.trim(),
          ),
          model,
          inputCharLimit: clampedCharLimit,
          pricePerMessage,
          freeTrialMessages,
        }),
      });

      // Upload KB files if any
      if (kbFiles.length > 0 && created.id) {
        let succeeded = 0;
        for (const file of kbFiles) {
          const fd = new FormData();
          fd.append("file", file);
          try {
            await api(`/api/agent-hub/agents/${created.id}/knowledge-base`, {
              method: "POST",
              body: fd,
            });
            succeeded++;
          } catch {
            // continue uploading remaining files
          }
        }
        const failed = kbFiles.length - succeeded;
        if (failed > 0) {
          alert(
            `${succeeded}/${kbFiles.length} files uploaded successfully. ${failed} file${failed !== 1 ? "s" : ""} failed to upload.`,
          );
        }
      }

      router.push("/creator");
    } catch {
      // auto-handled by api
    } finally {
      setSaving(false);
    }
  };

  const isValid =
    name.trim() &&
    description.trim() &&
    systemPrompt.trim();

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
          <h1 className="text-lg font-bold">{t("creator.createNewAgent")}</h1>
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
                {t("creator.basicInfo")}
              </h2>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("creator.form.name")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder={t("creator.form.namePlaceholder")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("creator.form.description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={t("creator.form.descPlaceholder")}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("creator.form.avatarUrl")}</label>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("creator.form.category")}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CATEGORY_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {t(`creator.cat.${key}`)}
                    </option>
                  ))}
                </select>
              </div>

            </section>

            {/* AI Config */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("creator.aiConfiguration")}
              </h2>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("creator.form.systemPrompt")}</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  placeholder={t("creator.form.systemPromptPlaceholder")}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("creator.form.model")}</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("creator.form.inputCharLimit")}</label>
                  <input
                    type="number"
                    min={1}
                    max={20000}
                    value={inputCharLimit}
                    onChange={(e) =>
                      setInputCharLimit(parseInt(e.target.value) || 2000)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t("creator.form.inputCharLimitHint")}
                  </p>
                </div>
              </div>
            </section>

            {/* Knowledge Base */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("creator.knowledgeBase")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("creator.knowledgeBaseHint")}
              </p>

              <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 cursor-pointer hover:border-muted-foreground transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {t("creator.clickToSelect")}
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

              {kbFiles.length > 0 && (
                <div className="space-y-2">
                  {kbFiles.map((f, i) => (
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
                        onClick={() => setKbFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pricing */}
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("creator.pricing")}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("creator.form.creditsPerMessage")}
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
                  <p className="text-[10px] text-muted-foreground">
                    {t("creator.form.freeAgentHint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("creator.form.freeTrialMessages")}
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
                  {t("creator.exampleConversations")}
                </h2>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addExample}
                  className="text-xs gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("common.add")}
                </Button>
              </div>

              {exampleConversations.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("creator.form.exampleHint")}
                </p>
              )}

              {exampleConversations.map((ex, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("creator.form.example")} {i + 1}
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
                    placeholder={t("creator.form.questionPlaceholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <textarea
                    value={ex.answer}
                    onChange={(e) => updateExample(i, "answer", e.target.value)}
                    placeholder={t("creator.form.answerPlaceholder")}
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
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!isValid || saving}
                className="brand-gradient-btn flex-1"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("creator.createAgent")
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

export default function NewAgentPage() {
  return (
    <AuthGuard>
      <NewAgentContent />
    </AuthGuard>
  );
}
