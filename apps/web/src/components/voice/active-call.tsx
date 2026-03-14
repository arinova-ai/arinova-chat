"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Bot,
  User,
  FileText,
  Minimize2,
} from "lucide-react";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { assetUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function ActiveCall() {
  const { t } = useTranslation();
  const callState = useVoiceCallStore((s) => s.callState);
  const peerName = useVoiceCallStore((s) => s.peerName);
  const peerAvatarUrl = useVoiceCallStore((s) => s.peerAvatarUrl);
  const peerType = useVoiceCallStore((s) => s.peerType);
  const isMuted = useVoiceCallStore((s) => s.isMuted);
  const volume = useVoiceCallStore((s) => s.volume);
  const voiceMode = useVoiceCallStore((s) => s.voiceMode);
  const transcript = useVoiceCallStore((s) => s.transcript);
  const transcriptEnabled = useVoiceCallStore((s) => s.transcriptEnabled);
  const callStartTime = useVoiceCallStore((s) => s.callStartTime);
  const toggleMute = useVoiceCallStore((s) => s.toggleMute);
  const setVolume = useVoiceCallStore((s) => s.setVolume);
  const endCall = useVoiceCallStore((s) => s.endCall);
  const toggleTranscript = useVoiceCallStore((s) => s.toggleTranscript);
  const minimized = useVoiceCallStore((s) => s.minimized);
  const toggleMinimized = useVoiceCallStore((s) => s.toggleMinimized);

  const [elapsed, setElapsed] = useState("00:00");

  // Duration timer
  useEffect(() => {
    if (callState !== "connected" || !callStartTime) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = String(Math.floor(diff / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setElapsed(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState, callStartTime]);

  if (callState === "idle") return null;
  if (minimized) return null;

  const isRinging = callState === "ringing" || callState === "requesting_mic";
  const isFallback = voiceMode !== "native";
  const FallbackIcon = peerType === "agent" ? Bot : User;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-neutral-900/95 backdrop-blur-sm" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Minimize button */}
      <div className="absolute right-4 z-10" style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-neutral-800 text-neutral-400 hover:text-white"
          onClick={toggleMinimized}
          title={t("voice.minimize")}
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Fallback mode badge */}
      {isFallback && callState === "connected" && (
        <div className="flex justify-center pt-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
            {t("voice.fallbackMode")}
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {/* Peer avatar */}
        <div className={cn("relative", isRinging && "animate-pulse")}>
          <Avatar className="h-24 w-24">
            {peerAvatarUrl ? (
              <img
                src={assetUrl(peerAvatarUrl)}
                alt={peerName ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <AvatarFallback className="bg-neutral-700 text-neutral-200 text-2xl">
                <FallbackIcon className="h-10 w-10" />
              </AvatarFallback>
            )}
          </Avatar>
          {callState === "connected" && (
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-neutral-900 bg-green-500" />
          )}
        </div>

        {/* Peer name */}
        <div className="text-center">
          <h2 className="text-lg font-semibold">{peerName ?? ""}</h2>
          <p className="text-sm text-muted-foreground">
            {isRinging ? t("voice.ringing") : elapsed}
          </p>
        </div>

        {/* Live transcript (only for agent calls) */}
        {peerType === "agent" && transcriptEnabled && callState === "connected" && transcript.length > 0 && (
          <div className="mx-4 max-h-40 w-full max-w-md overflow-y-auto rounded-lg bg-neutral-800 p-3">
            {transcript.slice(-5).map((line) => (
              <p
                key={line.id}
                className={cn(
                  "text-sm",
                  line.speaker === "user" ? "text-blue-400" : "text-neutral-200",
                  !line.isFinal && "italic text-muted-foreground"
                )}
              >
                <span className="font-medium">
                  {line.speaker === "user" ? t("voice.labelYou") : t("voice.labelAI")}
                </span>
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4 pb-8">
        {/* Volume slider */}
        {callState === "connected" && (
          <div className="flex items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
              className="text-muted-foreground hover:text-foreground"
            >
              {volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1 w-32 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-4">
          {callState === "connected" && (
            <>
              {/* Transcript toggle (agent calls only) */}
              {peerType === "agent" && (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className={cn(
                    "rounded-full",
                    transcriptEnabled
                      ? "bg-neutral-700 text-white"
                      : "bg-neutral-800 text-muted-foreground"
                  )}
                  onClick={toggleTranscript}
                  title={transcriptEnabled ? t("voice.hideTranscript") : t("voice.showTranscript")}
                >
                  <FileText className="h-5 w-5" />
                </Button>
              )}

              {/* Mute toggle */}
              <Button
                variant="ghost"
                size="icon-lg"
                className={cn(
                  "rounded-full",
                  isMuted
                    ? "bg-red-500/20 text-red-400"
                    : "bg-neutral-700 text-white"
                )}
                onClick={toggleMute}
                title={isMuted ? t("voice.unmute") : t("voice.mute")}
              >
                {isMuted ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
            </>
          )}

          {/* Hangup / Cancel */}
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-full bg-red-500 text-white hover:bg-red-600"
            onClick={endCall}
            title={isRinging ? t("voice.cancelCall") : t("voice.hangup")}
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
