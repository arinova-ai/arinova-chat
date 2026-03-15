"use client";

import { useState, useEffect } from "react";
import { Building2, Bot, Users, Send, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccountStore, type Account, type AccountSubscriber } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";

interface Props {
  account: Account;
  onClose: () => void;
}

export function OfficialSettings({ account, onClose }: Props) {
  const { t } = useTranslation();
  const updateAccount = useAccountStore((s) => s.updateAccount);
  const deleteAccount = useAccountStore((s) => s.deleteAccount);
  const loadSubscribers = useAccountStore((s) => s.loadSubscribers);
  const broadcast = useAccountStore((s) => s.broadcast);

  const [tab, setTab] = useState<"profile" | "agent" | "subscribers" | "broadcast">("profile");
  const [name, setName] = useState(account.name);
  const [bio, setBio] = useState(account.bio ?? "");
  const [aiMode, setAiMode] = useState(account.aiMode);
  const [systemPrompt, setSystemPrompt] = useState(account.systemPrompt ?? "");
  const [apiKey, setApiKey] = useState(account.apiKey ?? "");
  const [model, setModel] = useState(account.model ?? "");
  const [contextWindow, setContextWindow] = useState(account.contextWindow);
  const [subscribers, setSubscribers] = useState<AccountSubscriber[]>([]);
  const [isPublic, setIsPublic] = useState(account.isPublic);
  const [category, setCategory] = useState(account.category ?? "");
  const [broadcastContent, setBroadcastContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tab === "subscribers") {
      loadSubscribers(account.id).then(setSubscribers);
    }
  }, [tab, account.id, loadSubscribers]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateAccount(account.id, { name, bio, isPublic, category: category || null });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgent = async () => {
    setSaving(true);
    try {
      await updateAccount(account.id, {
        aiMode,
        systemPrompt,
        apiKey,
        model,
        contextWindow,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastContent.trim()) return;
    await broadcast(account.id, broadcastContent.trim());
    setBroadcastContent("");
  };

  const handleDelete = async () => {
    if (!confirm(t("accounts.deleteConfirm"))) return;
    await deleteAccount(account.id);
    onClose();
  };

  const tabs = [
    { id: "profile" as const, label: t("accounts.tabProfile"), icon: Building2 },
    { id: "agent" as const, label: t("accounts.tabAgent"), icon: Bot },
    { id: "subscribers" as const, label: t("accounts.tabSubscribers"), icon: Users },
    { id: "broadcast" as const, label: t("accounts.tabBroadcast"), icon: Send },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border px-4 shrink-0">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors ${
              tab === tb.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tb.icon className="h-4 w-4" />
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === "profile" && (
          <>
            <div>
              <label className="text-sm font-medium">{t("common.name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("accounts.bio")}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">{t("accounts.isPublic")}</label>
                <p className="text-xs text-muted-foreground">{t("accounts.isPublicDesc")}</p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("accounts.category")}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("accounts.categoryNone")}</option>
                <option value="news">{t("accounts.categoryNews")}</option>
                <option value="entertainment">{t("accounts.categoryEntertainment")}</option>
                <option value="education">{t("accounts.categoryEducation")}</option>
                <option value="technology">{t("accounts.categoryTechnology")}</option>
                <option value="lifestyle">{t("accounts.categoryLifestyle")}</option>
                <option value="business">{t("accounts.categoryBusiness")}</option>
                <option value="other">{t("accounts.categoryOther")}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveProfile} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? t("common.saving") : t("common.save")}
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("common.delete")}
              </Button>
            </div>
          </>
        )}

        {tab === "agent" && (
          <>
            <div>
              <label className="text-sm font-medium">{t("accounts.aiMode")}</label>
              <select
                value={aiMode}
                onChange={(e) => setAiMode(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="none">{t("accounts.aiModeNone")}</option>
                <option value="auto_reply">{t("accounts.aiModeAutoReply")}</option>
                <option value="stateless">{t("accounts.aiModeStateless")}</option>
              </select>
            </div>
            {aiMode !== "none" && (
              <>
                <div>
                  <label className="text-sm font-medium">{t("accounts.systemPrompt")}</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t("accounts.model")}</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4o / claude-sonnet-4-20250514"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t("accounts.apiKey")}</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t("accounts.contextWindow")}</label>
                  <input
                    type="number"
                    value={contextWindow}
                    onChange={(e) => setContextWindow(Number(e.target.value))}
                    min={256}
                    max={128000}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
            <Button onClick={handleSaveAgent} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        )}

        {tab === "subscribers" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("accounts.subscriberCount", { count: subscribers.length })}
            </p>
            {subscribers.map((sub) => (
              <div key={sub.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium">
                  {sub.userName?.[0] ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sub.userName}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(sub.subscribedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
            {subscribers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                {t("accounts.noSubscribers")}
              </p>
            )}
          </div>
        )}

        {tab === "broadcast" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("accounts.broadcastDesc")}</p>
            <textarea
              value={broadcastContent}
              onChange={(e) => setBroadcastContent(e.target.value)}
              rows={6}
              placeholder={t("accounts.broadcastPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
            <Button onClick={handleBroadcast} disabled={!broadcastContent.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {t("accounts.sendBroadcast")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
