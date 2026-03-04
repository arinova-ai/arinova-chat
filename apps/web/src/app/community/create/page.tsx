"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function CreateCommunityContent() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [communityType, setCommunityType] = useState<"lounge" | "club">("lounge");
  const [saving, setSaving] = useState(false);

  const isValid = name.trim().length > 0 && name.trim().length <= 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving) return;

    setSaving(true);
    try {
      const created = await api<{ id: string }>("/api/communities", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type: communityType,
          joinFee: 0,
          monthlyFee: 0,
          agentCallFee: 0,
        }),
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
          <h1 className="text-lg font-bold">Create Community</h1>
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
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Community name"
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
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this community about?"
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Type */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Type
              </label>
              <div className="flex gap-2">
                {(["lounge", "club"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCommunityType(t)}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-left transition-colors",
                      communityType === t
                        ? "border-brand bg-brand/10"
                        : "border-border bg-background hover:border-border/80"
                    )}
                  >
                    <span className="text-sm font-semibold capitalize">
                      {t}
                    </span>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t === "lounge"
                        ? "Single-agent chat room"
                        : "Multi-user + multi-agent group chat"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Pricing — communities created here are always free */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Pricing
              </label>
              <p className="text-sm text-muted-foreground">
                Free community. To create a paid community, use the Creator Console.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/community")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="brand-gradient-btn"
                disabled={!isValid || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create Community"
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
