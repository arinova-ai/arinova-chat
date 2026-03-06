"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CommunityType = "official" | "club";
type CsMode = "ai_only" | "human_only" | "hybrid";

function CreateCommunityContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [communityType, setCommunityType] = useState<CommunityType>("club");
  const [csMode, setCsMode] = useState<CsMode>("ai_only");
  const [saving, setSaving] = useState(false);

  const isValid = name.trim().length > 0 && name.trim().length <= 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        type: communityType,
        joinFee: 0,
        monthlyFee: 0,
        agentCallFee: 0,
      };
      if (communityType === "official") {
        payload.csMode = csMode;
      }
      const created = await api<{ id: string }>("/api/communities", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/community/${created.id}`);
    } catch {
      // auto-handled
    } finally {
      setSaving(false);
    }
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

            {/* Type */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("community.form.type")}
              </label>
              <div className="flex gap-2">
                {(["official", "club"] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setCommunityType(tp)}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-left transition-colors",
                      communityType === tp
                        ? "border-brand bg-brand/10"
                        : "border-border bg-background hover:border-border/80"
                    )}
                  >
                    <span className="text-sm font-semibold">
                      {t(`community.type.${tp}`)}
                    </span>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {tp === "official"
                        ? t("community.form.officialDesc")
                        : t("community.form.clubDesc")}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* CS Mode (official only) */}
            {communityType === "official" && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("community.form.csMode")}
                </label>
                <div className="flex flex-col gap-2">
                  {(["ai_only", "human_only", "hybrid"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCsMode(mode)}
                      className={cn(
                        "rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                        csMode === mode
                          ? "border-brand bg-brand/10"
                          : "border-border bg-background hover:border-border/80"
                      )}
                    >
                      {t(`community.csMode.${mode === "ai_only" ? "aiOnly" : mode === "human_only" ? "humanOnly" : "hybrid"}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
