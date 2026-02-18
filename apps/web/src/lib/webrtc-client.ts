/**
 * WebRTC client for voice calls.
 * Handles peer connection, audio tracks, and signaling via /ws/voice.
 */

import { WS_URL } from "./config";
import { api } from "./api";
import type { VoiceWSClientEvent, VoiceWSServerEvent } from "./voice-types";

type SignalingHandler = (event: VoiceWSServerEvent) => void;

interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export class WebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private _onSignaling: SignalingHandler | null = null;
  private _onRemoteTrack: ((track: MediaStreamTrack, stream: MediaStream) => void) | null = null;
  private _onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  onSignaling(handler: SignalingHandler) {
    this._onSignaling = handler;
  }

  onRemoteTrack(handler: (track: MediaStreamTrack, stream: MediaStream) => void) {
    this._onRemoteTrack = handler;
  }

  onConnectionStateChange(handler: (state: RTCPeerConnectionState) => void) {
    this._onConnectionStateChange = handler;
  }

  /** Get ICE server configuration from backend */
  private async getIceServers(): Promise<IceServerConfig[]> {
    try {
      const data = await api<{ iceServers: IceServerConfig[] }>("/api/voice/ice-servers", { silent: true });
      return data.iceServers;
    } catch {
      // Fallback to public STUN servers
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }
  }

  /** Connect to voice signaling WebSocket */
  connectSignaling() {
    const voiceWsUrl = WS_URL.replace(/\/ws$/, "/ws/voice");
    this.ws = new WebSocket(voiceWsUrl);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as VoiceWSServerEvent;
        this._onSignaling?.(data);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onclose = () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    };

    this.ws.onopen = () => {
      // Ping to keep alive
      this.pingInterval = setInterval(() => {
        this.sendSignaling({ type: "voice_ping" });
      }, 30000);
    };
  }

  /** Send a signaling event via WebSocket */
  sendSignaling(event: VoiceWSClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /** Request microphone access */
  async requestMicrophone(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this.localStream = stream;
    return stream;
  }

  /** Create peer connection and add audio track */
  async createPeerConnection(): Promise<RTCPeerConnection> {
    const iceServers = await this.getIceServers();

    this.pc = new RTCPeerConnection({ iceServers });

    // Add local audio tracks
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        this.pc.addTrack(track, this.localStream);
      }
    }

    // Handle remote tracks
    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream && event.track.kind === "audio") {
        this._onRemoteTrack?.(event.track, stream);
      }
    };

    // Send ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({
          type: "voice_ice_candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Track connection state
    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this._onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    return this.pc;
  }

  /** Create and send SDP offer */
  async createOffer(conversationId: string, agentId: string): Promise<void> {
    if (!this.pc) throw new Error("Peer connection not created");

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.sendSignaling({
      type: "voice_offer",
      sdp: offer.sdp!,
      conversationId,
      agentId,
    });
  }

  /** Handle incoming SDP answer */
  async handleAnswer(sdp: string): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription({ type: "answer", sdp });
  }

  /** Handle incoming ICE candidate */
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Mute/unmute local audio */
  setMuted(muted: boolean) {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  /** Set up remote audio playback */
  setupRemoteAudio(stream: MediaStream): HTMLAudioElement {
    if (!this.remoteAudio) {
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
    }
    this.remoteAudio.srcObject = stream;

    // Handle autoplay policy
    this.remoteAudio.play().catch(() => {
      // Will be retried on user interaction
    });

    return this.remoteAudio;
  }

  /** Set volume (0-1) */
  setVolume(volume: number) {
    if (this.remoteAudio) {
      this.remoteAudio.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /** Clean up and close everything */
  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
