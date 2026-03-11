// Simple ringtone using Web Audio API
let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startRingtone() {
  stopRingtone();

  audioCtx = new AudioContext();
  gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
  gainNode.gain.value = 0;

  oscillator = audioCtx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = 440;
  oscillator.connect(gainNode);
  oscillator.start();

  // Ring pattern: 1s on, 2s off (like a phone)
  const ringCycle = () => {
    if (!gainNode || !audioCtx) return;
    gainNode.gain.setTargetAtTime(0.3, audioCtx.currentTime, 0.02);
    setTimeout(() => {
      if (!gainNode || !audioCtx) return;
      gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
    }, 1000);
  };

  ringCycle();
  intervalId = setInterval(ringCycle, 3000); // 1s ring + 2s silence
}

export function stopRingtone() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}
