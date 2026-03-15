"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Bot, Webhook, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore, type Account } from "@/store/account-store";

type AutoReplyMode = "none" | "ai" | "webhook";

export default function AutoReplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: accountId } = use(params);
  const { t } = useTranslation();
  const router = useRouter();
  const { updateAccount } = useAccountStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [autoReplyMode, setAutoReplyMode] = useState<AutoReplyMode>("none");
  const [autoReplySystemPrompt, setAutoReplySystemPrompt] = useState("");
  const [autoReplyModel, setAutoReplyModel] = useState("");
  const [autoReplyWebhookUrl, setAutoReplyWebhookUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const account = await api<Account>(`/api/accounts/${accountId}`);
        if (cancelled) return;
        setWelcomeEnabled(account.welcomeEnabled ?? false);
        setWelcomeMessage(account.welcomeMessage ?? "");
        setAutoReplyMode(
          (account.autoReplyMode as AutoReplyMode) ?? "none"
        );
        setAutoReplySystemPrompt(account.autoReplySystemPrompt ?? "");
        setAutoReplyModel(account.model ?? "");
        setAutoReplyWebhookUrl(account.autoReplyWebhookUrl ?? "");
      } catch {
        // handled by api helper
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccount(accountId, {
        welcomeEnabled,
        welcomeMessage: welcomeMessage || null,
        autoReplyMode,
        autoReplySystemPrompt: autoReplySystemPrompt || null,
        autoReplyWebhookUrl: autoReplyWebhookUrl || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const modeOptions: { value: AutoReplyMode; icon: typeof Bot; label: string }[] = [
    { value: "none", icon: MessageSquare, label: t("official.autoReply.modeNone") },
    { value: "ai", icon: Bot, label: t("official.autoReply.modeAi") },
    { value: "webhook", icon: Webhook, label: t("official.autoReply.modeWebhook") },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          {t("official.autoReply.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">
            {t("official.autoReply.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("official.autoReply.subtitle")}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
        {/* Welcome Message Section */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            {t("official.autoReply.welcomeTitle")}
          </h2>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t("official.autoReply.welcomeEnabled")}
            </label>
            <Switch
              checked={welcomeEnabled}
              onCheckedChange={setWelcomeEnabled}
            />
          </div>

          {welcomeEnabled && (
            <Textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder={t("official.autoReply.welcomePlaceholder")}
              rows={3}
              className="resize-none"
            />
          )}
        </section>

        <Separator />

        {/* Auto-Reply Mode Section */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            {t("official.autoReply.modeTitle")}
          </h2>

          <div className="flex gap-2">
            {modeOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAutoReplyMode(opt.value)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    autoReplyMode === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* AI mode settings */}
          {autoReplyMode === "ai" && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("official.autoReply.systemPrompt")}
                </label>
                <Textarea
                  value={autoReplySystemPrompt}
                  onChange={(e) => setAutoReplySystemPrompt(e.target.value)}
                  placeholder={t("official.autoReply.systemPromptPlaceholder")}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("official.autoReply.model")}
                </label>
                <Input
                  value={autoReplyModel}
                  onChange={(e) => setAutoReplyModel(e.target.value)}
                  placeholder={t("official.autoReply.modelPlaceholder")}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {t("official.autoReply.knowledgeBaseHint")}
              </p>
            </div>
          )}

          {/* Webhook mode settings */}
          {autoReplyMode === "webhook" && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("official.autoReply.webhookUrl")}
                </label>
                <Input
                  value={autoReplyWebhookUrl}
                  onChange={(e) => setAutoReplyWebhookUrl(e.target.value)}
                  placeholder={t("official.autoReply.webhookPlaceholder")}
                  type="url"
                />
              </div>
            </div>
          )}
        </section>

        <Separator />

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving
              ? t("official.autoReply.saving")
              : t("official.autoReply.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
