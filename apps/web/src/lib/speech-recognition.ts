/**
 * Web Speech API SpeechRecognition wrapper.
 * Provides browser-based speech-to-text for voice call fallback mode.
 */

type ResultHandler = (text: string, isFinal: boolean) => void;
type ErrorHandler = (error: string) => void;

// Browser vendor-prefixed SpeechRecognition
const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    : undefined;

class BrowserSpeechRecognition {
  private recognition: SpeechRecognition | null = null;
  private _onResult: ResultHandler | null = null;
  private _onError: ErrorHandler | null = null;
  private _running = false;
  private _shouldRestart = false;

  isSupported(): boolean {
    return SpeechRecognitionAPI != null;
  }

  onResult(handler: ResultHandler) {
    this._onResult = handler;
  }

  onError(handler: ErrorHandler) {
    this._onError = handler;
  }

  start(lang = "zh-TW") {
    if (!this.isSupported()) {
      this._onError?.("Speech recognition is not supported in this browser.");
      return;
    }

    if (this._running) return;

    const Recognition = SpeechRecognitionAPI as new () => SpeechRecognition;
    this.recognition = new Recognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          this._onResult?.(result[0].transcript, result.isFinal);
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are not real errors
      if (event.error === "no-speech" || event.error === "aborted") return;
      this._onError?.(event.error);
    };

    this.recognition.onend = () => {
      this._running = false;
      // Auto-restart if continuous mode is desired and we didn't explicitly stop
      if (this._shouldRestart) {
        this.start(lang);
      }
    };

    this._running = true;
    this._shouldRestart = true;
    this.recognition.start();
  }

  stop() {
    this._shouldRestart = false;
    this._running = false;
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.stop();
      this.recognition = null;
    }
  }
}

export const speechRecognition = new BrowserSpeechRecognition();
