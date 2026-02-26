"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
    return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus"))
    return "audio/ogg;codecs=opus";
  return "audio/webm";
}

// Fixed bar heights so they don't change every render
const BAR_HEIGHTS = [
  12, 8, 16, 10, 20, 14, 6, 18, 12, 22, 8, 16, 10, 20, 14, 8, 18, 12, 16,
  10,
];

export function VoiceRecorder({
  onRecordingComplete,
  onCancel,
}: VoiceRecorderProps) {
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Start recording on mount
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const mimeType = getSupportedMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const elapsed = Math.round(
            (Date.now() - startTimeRef.current) / 1000
          );
          stream.getTracks().forEach((t) => t.stop());
          onRecordingComplete(blob, elapsed);
        };

        startTimeRef.current = Date.now();
        recorder.start(100);

        timerRef.current = setInterval(() => {
          setDuration(
            Math.round((Date.now() - startTimeRef.current) / 1000)
          );
        }, 200);
      } catch {
        onCancel();
      }
    }

    start();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    onCancel();
  }, [onCancel]);

  return (
    <div className="flex items-center gap-3 flex-1">
      <style>{`
        @keyframes voice-bar {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
      `}</style>

      {/* Red pulse dot + timer */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        <span className="text-sm font-mono text-red-400">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Waveform bars */}
      <div className="flex items-center gap-0.5 flex-1">
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="w-1 rounded-full bg-red-400/60"
            style={{
              height: `${h}px`,
              animation: `voice-bar 0.6s ease-in-out ${i * 0.05}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Cancel */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCancel}
        className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        title="Cancel"
      >
        <X className="h-5 w-5" />
      </Button>

      {/* Stop */}
      <Button
        size="icon"
        onClick={handleStop}
        className="h-11 w-11 shrink-0 rounded-xl bg-red-500 hover:bg-red-600 text-white"
        title="Stop recording"
      >
        <Square className="h-5 w-5 fill-current" />
      </Button>
    </div>
  );
}
