"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Trash2,
  Mic,
  Square,
  Play,
  Pause,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { api } from "@/lib/api";

type Tab = "general" | "pricing" | "voice" | "danger";
type PricingMode = "free" | "subscription" | "perMessage";
type VoiceStatus = "none" | "processing" | "ready" | "failed";

interface VoiceSample {
  id: string;
  url: string;
  createdAt: string;
}

const CATEGORIES = [
  "Entertainment",
  "Music",
  "Gaming",
  "Education",
  "Lifestyle",
  "Art",
  "Other",
];

export default function LoungeSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { updateAccount, deleteAccount } = useAccountStore();

  const accountId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("general");

  // General
  const [isPublic, setIsPublic] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [category, setCategory] = useState("Other");

  // Pricing
  const [pricingMode, setPricingMode] = useState<PricingMode>("free");
  const [pricingAmount, setPricingAmount] = useState<number>(0);
  const [freeTrialMessages, setFreeTrialMessages] = useState<number>(0);

  // Voice
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("none");
  const [voiceSamples, setVoiceSamples] = useState<VoiceSample[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Danger
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    async function loadAccount() {
      try {
        const account = await api<{
          id: string;
          name: string;
          bio: string | null;
          avatar: string | null;
          isPublic: boolean;
          category: string | null;
          pricingMode: string | null;
          pricingAmount: number | null;
          freeTrialMessages: number | null;
          voiceModelStatus: string | null;
        }>(`/api/accounts/${accountId}`);
        setName(account.name ?? "");
        setBio(account.bio ?? "");
        setAvatarUrl(account.avatar ?? "");
        setIsPublic(account.isPublic ?? false);
        setCategory(account.category ?? "Other");
        setPricingMode(
          (account.pricingMode as PricingMode) ?? "free"
        );
        setPricingAmount(account.pricingAmount ?? 0);
        setFreeTrialMessages(account.freeTrialMessages ?? 0);
        setVoiceStatus(
          (account.voiceModelStatus as VoiceStatus) ?? "none"
        );
      } catch (err) {
        console.error("Failed to load account:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAccount();
  }, [accountId]);

  useEffect(() => {
    async function loadVoiceSamples() {
      try {
        const res = await api<
          VoiceSample[] | { samples: VoiceSample[] }
        >(`/api/accounts/${accountId}/voice-samples`);
        const samples = Array.isArray(res) ? res : res?.samples ?? [];
        setVoiceSamples(samples);
      } catch {
        // voice samples may not exist yet
      }
    }
    if (tab === "voice") {
      loadVoiceSamples();
    }
  }, [accountId, tab]);

  // --- General / Pricing save ---
  const handleSaveGeneral = useCallback(async () => {
    setSaving(true);
    try {
      await updateAccount(accountId, {
        isPublic,
        name,
        bio,
        avatar: avatarUrl || null,
        category,
      });
    } catch (err) {
      console.error("Failed to save general settings:", err);
    } finally {
      setSaving(false);
    }
  }, [accountId, isPublic, name, bio, avatarUrl, category, updateAccount]);

  const handleSavePricing = useCallback(async () => {
    setSaving(true);
    try {
      await updateAccount(accountId, {
        pricingMode,
        pricingAmount: pricingMode === "free" ? null : pricingAmount,
        freeTrialMessages,
      });
    } catch (err) {
      console.error("Failed to save pricing settings:", err);
    } finally {
      setSaving(false);
    }
  }, [accountId, pricingMode, pricingAmount, freeTrialMessages, updateAccount]);

  // --- Voice recording ---
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((tr) => tr.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      // mic permission denied
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setPlaying(true);
      audioRef.current.onended = () => setPlaying(false);
    }
  }, [audioUrl, playing]);

  const handleUploadSample = useCallback(async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "voice-sample.webm");
      const res = await api<{ url: string }>("/api/auth/upload-avatar", {
        method: "POST",
        body: formData,
      });
      await api(`/api/accounts/${accountId}/voice-samples`, {
        method: "POST",
        body: JSON.stringify({ url: res.url }),
      });
      setAudioBlob(null);
      // Reload samples
      const samplesRes = await api<
        VoiceSample[] | { samples: VoiceSample[] }
      >(`/api/accounts/${accountId}/voice-samples`);
      const samples = Array.isArray(samplesRes)
        ? samplesRes
        : samplesRes?.samples ?? [];
      setVoiceSamples(samples);
    } catch (err) {
      console.error("Failed to upload voice sample:", err);
    } finally {
      setUploading(false);
    }
  }, [audioBlob, accountId]);

  // --- Danger zone ---
  const handleDelete = useCallback(async () => {
    try {
      await deleteAccount(accountId);
      router.push("/");
    } catch (err) {
      console.error("Failed to delete account:", err);
    }
  }, [accountId, deleteAccount, router]);

  // --- Voice status badge ---
  const voiceStatusBadge = () => {
    switch (voiceStatus) {
      case "processing":
        return <Badge variant="secondary">{t("lounge.settings.voiceProcessing")}</Badge>;
      case "ready":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{t("lounge.settings.voiceReady")}</Badge>;
      case "failed":
        return <Badge variant="destructive">{t("lounge.settings.voiceFailed")}</Badge>;
      default:
        return <Badge variant="outline">{t("lounge.settings.voiceNone")}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background pt-[env(safe-area-inset-top)]">
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t("lounge.settings.title")}</h1>
      </header>

      {/* Tab Bar */}
      <div className="flex border-b border-border px-4 shrink-0">
        {(
          [
            { id: "general", label: t("lounge.settings.general") },
            { id: "pricing", label: t("lounge.settings.pricing") },
            { id: "voice", label: t("lounge.settings.voice") },
            { id: "danger", label: t("lounge.settings.dangerZone") },
          ] as const
        ).map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${
              tab === tb.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-2xl space-y-6 p-4">
          {/* ==================== General Tab ==================== */}
          {tab === "general" && (
            <>
              {/* Public toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("lounge.settings.public")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("lounge.settings.publicDesc")}
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("common.name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              {/* Description / Bio */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("accounts.bio")}
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              {/* Avatar */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("lounge.settings.avatar")}</label>
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Mic className="h-6 w-6 text-purple-500" />
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append("file", file);
                        try {
                          const res = await api<{ url: string }>("/api/notes/upload", { method: "POST", body: formData });
                          setAvatarUrl(res.url);
                        } catch { /* toast */ }
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors">
                      <Upload className="h-3.5 w-3.5" />
                      {t("lounge.settings.uploadAvatar")}
                    </span>
                  </label>
                </div>
              </div>

              {/* Cover Image */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("lounge.settings.cover")}</label>
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="w-full h-32 rounded-lg object-cover" />
                ) : (
                  <div className="w-full h-32 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center">
                    <Mic className="h-8 w-8 text-purple-500/30" />
                  </div>
                )}
                <label className="cursor-pointer inline-block">
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const formData = new FormData(); formData.append("file", file);
                    try {
                      const res = await api<{ url: string }>("/api/notes/upload", { method: "POST", body: formData });
                      setCoverUrl(res.url);
                    } catch {}
                    e.target.value = "";
                  }} />
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    {t("lounge.settings.uploadCover")}
                  </span>
                </label>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("lounge.settings.category")}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

            </>
          )}
          {/* Sticky Save */}
          <div className="sticky bottom-0 -mx-4 mt-4 border-t bg-background px-4 py-3">
            <Button onClick={handleSaveGeneral} disabled={saving} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "..." : t("common.save")}
            </Button>
          </div>

          {/* ==================== Pricing Tab ==================== */}
          {tab === "pricing" && (
            <>
              {/* Pricing mode radio */}
              <div className="space-y-3">
                <label className="text-sm font-medium">
                  {t("lounge.settings.pricingMode")}
                </label>
                {(
                  [
                    { value: "free", label: t("lounge.settings.free") },
                    {
                      value: "subscription",
                      label: t("lounge.settings.subscription"),
                    },
                    {
                      value: "perMessage",
                      label: t("lounge.settings.perMessage"),
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="radio"
                      name="pricingMode"
                      value={opt.value}
                      checked={pricingMode === opt.value}
                      onChange={() => setPricingMode(opt.value)}
                      className="accent-brand"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Subscription price */}
              {pricingMode === "subscription" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("lounge.settings.priceAmount")} (tokens/month)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pricingAmount}
                    onChange={(e) =>
                      setPricingAmount(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
              )}

              {/* Per-message price */}
              {pricingMode === "perMessage" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("lounge.settings.priceAmount")} (tokens/message)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pricingAmount}
                    onChange={(e) =>
                      setPricingAmount(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
              )}

              {/* Free trial messages */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("lounge.settings.freeTrialMessages")}
                </label>
                <input
                  type="number"
                  min={0}
                  value={freeTrialMessages}
                  onChange={(e) =>
                    setFreeTrialMessages(parseInt(e.target.value, 10) || 0)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              {/* Save */}
              <Button onClick={handleSavePricing} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "..." : t("common.save")}
              </Button>
            </>
          )}

          {/* ==================== Voice Tab ==================== */}
          {tab === "voice" && (
            <div className="space-y-4">
              {/* Voice guidance */}
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground text-sm">{t("lounge.settings.voiceGuideTitle")}</p>
                <p>• {t("lounge.settings.voiceGuide1")}</p>
                <p>• {t("lounge.settings.voiceGuide2")}</p>
                <p>• {t("lounge.settings.voiceGuide3")}</p>
              </div>
              {/* Voice model status */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {t("lounge.settings.voiceStatus")}
                </span>
                {voiceStatusBadge()}
              </div>

              {/* Upload voice sample */}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("lounge.settings.uploadSample")}
                </p>

                {/* Recording controls */}
                <div className="flex items-center gap-3">
                  {!recording ? (
                    <Button onClick={startRecording} variant="outline">
                      <Mic className="mr-2 h-4 w-4 text-red-500" />
                      {t("lounge.settings.startRecording")}
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} variant="destructive">
                      <Square className="mr-2 h-4 w-4" />
                      {t("lounge.settings.stopRecording")}
                    </Button>
                  )}
                </div>

                {/* Playback + Upload */}
                {audioUrl && (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={togglePlayback}
                    >
                      {playing ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <span className="text-sm flex-1">
                      {t("lounge.settings.sampleReady")}
                    </span>
                    {audioBlob && (
                      <Button
                        size="sm"
                        onClick={handleUploadSample}
                        disabled={uploading}
                      >
                        <Upload className="mr-1 h-3 w-3" />
                        {uploading ? "..." : t("lounge.settings.uploadSample")}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Voice samples list */}
              {voiceSamples.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {t("lounge.settings.voiceStatus")}
                  </h3>
                  {voiceSamples.map((sample) => (
                    <div
                      key={sample.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (audioRef.current) {
                            audioRef.current.src = sample.url;
                            audioRef.current.play();
                          }
                        }}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground flex-1">
                        {new Date(sample.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== Danger Zone Tab ==================== */}
          {tab === "danger" && (
            <div className="space-y-6">
              {/* Transfer ownership */}
              <div className="rounded-lg border border-border p-4 opacity-60">
                <h3 className="text-sm font-medium">
                  {t("lounge.settings.transferOwnership")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("lounge.settings.transferDesc")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled
                >
                  {t("lounge.settings.transferOwnership")}
                </Button>
              </div>

              {/* Delete account */}
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-medium text-destructive">
                    {t("lounge.settings.deleteAccount")}
                  </h3>
                </div>
                {!deleteConfirmOpen ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-3"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("lounge.settings.deleteAccount")}
                  </Button>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-destructive">
                      {t("lounge.settings.deleteConfirm")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("lounge.settings.deleteAccount")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
