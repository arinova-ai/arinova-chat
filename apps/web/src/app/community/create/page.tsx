"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DefaultAvatarPicker } from "@/components/ui/default-avatar-picker";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

const CATEGORIES = [
  "general",
  "gaming",
  "tech",
  "art",
  "music",
  "education",
  "business",
  "finance",
  "lifestyle",
  "other",
] as const;

const AGENT_JOIN_POLICY_VALUES = ["owner_only", "admin_agents", "member_agents"] as const;

function CreateCommunityContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [approvalQuestions, setApprovalQuestions] = useState<string[]>([""]);
  const [agentJoinPolicy, setAgentJoinPolicy] = useState("owner_only");
  const [saving, setSaving] = useState(false);

  const isValid = name.trim().length > 0 && name.trim().length <= 100;

  // Profile setup after create
  const [profileSetup, setProfileSetup] = useState(false);
  const [createdCommunity, setCreatedCommunity] = useState<{ id: string; conversationId?: string } | null>(null);
  const [profileNickname, setProfileNickname] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const handleProfileDone = async () => {
    if (!createdCommunity || !profileNickname.trim()) return;
    setProfileSaving(true);
    try {
      await api(`/api/communities/${createdCommunity.id}/identity`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: profileNickname.trim(),
          avatarUrl: profileAvatar || null,
        }),
      });
    } catch { /* continue anyway */ }
    if (createdCommunity.conversationId) {
      router.push(`/?c=${createdCommunity.conversationId}`);
    } else {
      router.push(`/community/${createdCommunity.id}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving) return;

    setSaving(true);
    try {
      // Auto-assign default avatar from category
      const defaultAvatar = category ? `/assets/community-avatars/${category}.png` : undefined;
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        type: "community",
        joinFee: 0,
        monthlyFee: 0,
        agentCallFee: 0,
        category: category || undefined,
        avatarUrl: defaultAvatar,
        coverImageUrl: coverImageUrl.trim() || undefined,
        requireApproval,
        approvalQuestions: requireApproval ? approvalQuestions.filter(q => q.trim()) : [],
        agentJoinPolicy,
      };
      const created = await api<{ id: string; conversationId?: string }>("/api/communities", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Show profile setup instead of navigating directly
      setCreatedCommunity(created);
      setProfileSetup(true);
    } catch {
      // auto-handled
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () => {
    setApprovalQuestions((prev) => [...prev, ""]);
  };

  const removeQuestion = (index: number) => {
    setApprovalQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, value: string) => {
    setApprovalQuestions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/community")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">{t("community.create")}</h1>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-6 pb-28 md:pb-6">
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-2xl space-y-6"
          >
            {/* Name */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("community.form.name")} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("community.form.namePlaceholder")}
                maxLength={100}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {name.length}/100
              </p>
            </div>

            {/* Description */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("community.form.description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("community.form.descriptionPlaceholder")}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Category */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("community.form.category")}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t("community.form.categoryPlaceholder")}</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`community.category.${cat}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Cover Image URL */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("community.form.coverImageUrl")}
              </label>
              <input
                type="text"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("community.form.coverImageUrlHint")}
              </p>
            </div>

            {/* Require Approval */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("community.form.requireApproval")}
                  </label>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {t("community.form.requireApprovalHint")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={requireApproval}
                  onClick={() => setRequireApproval((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                    requireApproval ? "bg-brand" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
                      requireApproval ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Approval Questions */}
              {requireApproval && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("community.form.approvalQuestions")}
                  </label>
                  {approvalQuestions.map((question, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => updateQuestion(i, e.target.value)}
                        placeholder={t("community.form.questionPlaceholder").replace("{n}", String(i + 1))}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      {approvalQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(i)}
                          className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="flex items-center gap-1.5 text-xs text-brand-text hover:text-brand transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("community.form.addQuestion")}
                  </button>
                </div>
              )}
            </div>

            {/* Agent Join Policy */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("community.form.agentJoinPolicy")}
              </label>
              <p className="text-[10px] text-muted-foreground">
                {t("community.form.agentJoinPolicyHint")}
              </p>
              <div className="space-y-2">
                {AGENT_JOIN_POLICY_VALUES.map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-3 cursor-pointer rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="agentJoinPolicy"
                      value={value}
                      checked={agentJoinPolicy === value}
                      onChange={(e) => setAgentJoinPolicy(e.target.value)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="text-sm">{t(`community.form.agentPolicy.${value === "owner_only" ? "ownerOnly" : value === "admin_agents" ? "adminAgents" : "memberAgents"}`)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/community")}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="brand-gradient-btn"
                disabled={!isValid || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("community.create")
                )}
              </Button>
            </div>
          </form>
        </div>

        <MobileBottomNav />
      </div>

      {/* Profile setup dialog after create */}
      <Dialog open={profileSetup} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t("community.identity.joinTitle")}</DialogTitle>
            <DialogDescription>{t("community.identity.joinDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("community.identity.nickname")}</label>
              <Input
                value={profileNickname}
                onChange={(e) => setProfileNickname(e.target.value)}
                placeholder={t("community.identity.nicknamePlaceholder")}
                maxLength={50}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("community.identity.avatar")}</label>
              <DefaultAvatarPicker
                selected={profileAvatar}
                onSelect={(url) => setProfileAvatar(url)}
              />
            </div>
            <Button
              className="brand-gradient-btn w-full"
              onClick={handleProfileDone}
              disabled={!profileNickname.trim() || profileSaving}
            >
              {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("community.identity.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CreateCommunityPage() {
  return (
    <AuthGuard>
      <CreateCommunityContent />
    </AuthGuard>
  );
}
