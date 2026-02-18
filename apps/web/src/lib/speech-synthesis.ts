/**
 * Web Speech API SpeechSynthesis wrapper.
 * Provides browser-based text-to-speech for voice call fallback mode.
 */

class BrowserSpeechSynthesis {
  private utterance: SpeechSynthesisUtterance | null = null;
  private _lang = "zh-TW";

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  setLang(lang: string) {
    this._lang = lang;
  }

  speak(text: string, onEnd?: () => void) {
    if (!this.isSupported()) return;

    // Cancel any current speech before starting new
    this.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this._lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    if (onEnd) {
      utterance.onend = onEnd;
    }

    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  pause() {
    if (!this.isSupported()) return;
    window.speechSynthesis.pause();
  }

  resume() {
    if (!this.isSupported()) return;
    window.speechSynthesis.resume();
  }

  cancel() {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
    this.utterance = null;
  }
}

export const browserTTS = new BrowserSpeechSynthesis();
