/**
 * Chat sound effects using Web Audio API.
 * Generates short tones programmatically — no static audio files needed.
 */

const STORAGE_KEY = "arinova-chat-sounds-enabled";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== "false";
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

/** Short ascending two-tone — played when sending a message. */
export function playSendSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  // First tone: C6 (1047 Hz)
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(1047, now);
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.08);

  // Second tone: E6 (1319 Hz)
  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.15, now + 0.06);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1319, now + 0.06);
  osc2.connect(gain2);
  osc2.start(now + 0.06);
  osc2.stop(now + 0.18);
}

/** Short soft ding — played when receiving a message from someone else. */
export function playReceiveSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  // Single soft tone: G5 (784 Hz)
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(784, now);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.25);
}
