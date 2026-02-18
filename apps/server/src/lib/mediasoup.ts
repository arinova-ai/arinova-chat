import * as mediasoup from "mediasoup";
import type {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  TransportListenIp,
} from "mediasoup/types";
import { env } from "../env.js";

// ===== Worker & Router =====

let worker: Worker | null = null;
let router: Router | null = null;

const mediaCodecs: mediasoup.types.RouterRtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
];

export async function getMediasoupRouter(): Promise<Router> {
  if (router) return router;

  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT,
  });

  worker.on("died", () => {
    console.error("mediasoup Worker died, restarting...");
    worker = null;
    router = null;
  });

  router = await worker.createRouter({ mediaCodecs });
  return router;
}

// ===== Transport Helpers =====

function getListenIps(): TransportListenIp[] {
  return [
    {
      ip: env.MEDIASOUP_LISTEN_IP,
      announcedIp: env.MEDIASOUP_ANNOUNCED_IP || undefined,
    },
  ];
}

export async function createWebRtcTransport(
  rtpRouter: Router
): Promise<WebRtcTransport> {
  const transport = await rtpRouter.createWebRtcTransport({
    listenIps: getListenIps(),
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  return transport;
}

// ===== ICE Server Config =====

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [];

  // STUN servers (comma-separated)
  if (env.STUN_SERVERS) {
    for (const url of env.STUN_SERVERS.split(",").map((s) => s.trim())) {
      if (url) servers.push({ urls: url });
    }
  }

  // TURN servers (comma-separated)
  if (env.TURN_SERVERS) {
    for (const url of env.TURN_SERVERS.split(",").map((s) => s.trim())) {
      if (url) {
        servers.push({
          urls: url,
          username: env.TURN_USERNAME || undefined,
          credential: env.TURN_CREDENTIAL || undefined,
        });
      }
    }
  }

  return servers;
}

// ===== Concurrent Call Limit =====

const MAX_CONCURRENT_CALLS = 10;
const activeCalls = new Map<
  string,
  {
    sessionId: string;
    agentId: string;
    userId: string;
    userTransport: WebRtcTransport;
    userProducer: Producer | null;
    userConsumer: Consumer | null;
    agentProducer: Producer | null;
    agentConsumer: Consumer | null;
    createdAt: Date;
  }
>();

export function getActiveCallCount(): number {
  return activeCalls.size;
}

export function canStartCall(): boolean {
  return activeCalls.size < MAX_CONCURRENT_CALLS;
}

export function getActiveCall(sessionId: string) {
  return activeCalls.get(sessionId);
}

export function setActiveCall(
  sessionId: string,
  call: {
    sessionId: string;
    agentId: string;
    userId: string;
    userTransport: WebRtcTransport;
    userProducer: Producer | null;
    userConsumer: Consumer | null;
    agentProducer: Producer | null;
    agentConsumer: Consumer | null;
    createdAt: Date;
  }
) {
  activeCalls.set(sessionId, call);
}

export function removeActiveCall(sessionId: string) {
  const call = activeCalls.get(sessionId);
  if (call) {
    call.userTransport.close();
    activeCalls.delete(sessionId);
  }
}

export function getCallByAgentAndUser(
  agentId: string,
  userId: string
): string | null {
  for (const [sessionId, call] of activeCalls) {
    if (call.agentId === agentId && call.userId === userId) {
      return sessionId;
    }
  }
  return null;
}

export { type Worker, type Router, type WebRtcTransport, type Producer, type Consumer };
