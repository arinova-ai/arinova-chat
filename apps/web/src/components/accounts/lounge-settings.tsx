"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, Square, Upload, Play, Pause, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccountStore, type Account } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";

interface Props {
  account: Account;
  onClose: () => void;
}

export function LoungeSettings({ account, onClose }: Props) {
  const { t } = useTranslation();
  const updateAccount = useAccountStore((s) => s.updateAccount);
  const deleteAccount = useAccountStore((s) => s.deleteAccount);
  const uploadVoiceSample = useAccountStore((s) => s.uploadVoiceSample);

  const [tab, setTab] = useState<"profile" | "voice" | "agent">("profile");
  const [name, setName] = useState(account.name);
  const [bio, setBio] = useState(account.bio ?? "");
  const [saving, setSaving] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(account.voiceSampleUrl);
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  const handleUploadSample = async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "voice-sample.webm");
      const res = await api<{ url: string }>("/api/uploads", {
        method: "POST",
        body: formData,
      });
      await uploadVoiceSample(account.id, res.url);
      setAudioBlob(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateAccount(account.id, { name, bio });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("accounts.deleteConfirm"))) return;
    await deleteAccount(account.id);
    onClose();
  };

  return (
    <div className="flex flex-col h-full">
      <audio ref={audioRef} className="hidden" />

      {/* Tabs */}
      <div className="flex border-b border-border px-4 shrink-0">
        {[
          { id: "profile" as const, label: t("accounts.tabProfile") },
          { id: "voice" as const, label: t("accounts.tabVoice") },
          { id: "agent" as const, label: t("accounts.tabAgent") },
        ].map((tb) => (
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

        {tab === "voice" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("accounts.voiceDesc")}</p>

            {/* Recording controls */}
            <div className="flex items-center gap-3">
              {!recording ? (
                <Button onClick={startRecording} variant="outline">
                  <Mic className="mr-2 h-4 w-4 text-red-500" />
                  {t("accounts.startRecording")}
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive">
                  <Square className="mr-2 h-4 w-4" />
                  {t("accounts.stopRecording")}
                </Button>
              )}
            </div>

            {/* Playback */}
            {audioUrl && (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Button size="icon" variant="ghost" onClick={togglePlayback}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <span className="text-sm flex-1">{t("accounts.voiceSampleReady")}</span>
                {audioBlob && (
                  <Button size="sm" onClick={handleUploadSample} disabled={uploading}>
                    <Upload className="mr-1 h-3 w-3" />
                    {uploading ? t("common.saving") : t("accounts.uploadSample")}
                  </Button>
                )}
              </div>
            )}

            {account.voiceCloneId && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                <p className="text-sm text-green-600 font-medium">{t("accounts.voiceCloneReady")}</p>
              </div>
            )}
          </div>
        )}

        {tab === "agent" && (
          <p className="text-sm text-muted-foreground">{t("accounts.loungeAgentDesc")}</p>
        )}
      </div>
    </div>
  );
}
