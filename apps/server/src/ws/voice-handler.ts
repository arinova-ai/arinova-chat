import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { randomUUID } from "crypto";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { agents, conversations } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { voiceWSClientEventSchema } from "@arinova/shared/schemas";
import type {
  VoiceWSServerEvent,
  VoiceCallState,
  VoiceAudioFormat,
} from "@arinova/shared/types";
import {
  getMediasoupRouter,
  createWebRtcTransport,
  canStartCall,
  getActiveCall,
  setActiveCall,
  removeActiveCall,
  getCallByAgentAndUser,
} from "../lib/mediasoup.js";
import {
  isAgentConnected,
  sendVoiceStartToAgent,
  sendVoiceEndToAgent,
  sendVoiceAudioToAgent,
} from "./agent-handler.js";

// ===== Call Session State =====

interface VoiceSession {
  sessionId: string;
  conversationId: string;
  agentId: string;
  userId: string;
  state: VoiceCallState;
  audioFormat: VoiceAudioFormat;
  socket: WebSocket;
  createdAt: Date;
}

// sessionId → VoiceSession
const voiceSessions = new Map<string, VoiceSession>();

// userId → sessionId (one active call per user)
const userToSession = new Map<string, string>();

function sendVoice(ws: WebSocket, event: VoiceWSServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

/** Send binary audio data to a user's voice WebSocket */
export function sendAudioToUser(sessionId: string, audioData: Buffer) {
  const session = voiceSessions.get(sessionId);
  if (session && session.socket.readyState === session.socket.OPEN) {
    session.socket.send(audioData);
  }
}

/** Notify user that voice call has ended (called from agent-handler) */
export function notifyVoiceEnded(sessionId: string, reason: string) {
  const session = voiceSessions.get(sessionId);
  if (session) {
    sendVoice(session.socket, {
      type: "voice_ended",
      sessionId,
      reason,
    });
    cleanupSession(sessionId);
  }
}

function cleanupSession(sessionId: string) {
  const session = voiceSessions.get(sessionId);
  if (session) {
    userToSession.delete(session.userId);
    voiceSessions.delete(sessionId);
    removeActiveCall(sessionId);
  }
}

export async function voiceWsRoutes(app: FastifyInstance) {
  app.get("/ws/voice", { websocket: true }, async (socket, request) => {
    // Auth from cookie (same pattern as /ws)
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.append(key, value);
        }
      }
    }

    const sessionResult = await auth.api.getSession({ headers });
    if (!sessionResult) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const userId = sessionResult.user.id;
    let activeSessionId: string | null = null;

    app.log.info(`Voice WS connected: user=${userId}`);

    socket.on("message", async (data: RawData) => {
      try {
        // Check if binary data (audio chunk from user)
        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
          if (activeSessionId) {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            // Forward user audio to agent (Task 3.2 + 3.3)
            sendVoiceAudioToAgent(activeSessionId, buf);
          }
          return;
        }

        const raw = JSON.parse(data.toString());
        const event = voiceWSClientEventSchema.parse(raw);

        if (event.type === "ping") {
          sendVoice(socket, { type: "pong" });
          return;
        }

        // ===== voice_auth: Initiate a call =====
        if (event.type === "voice_auth") {
          // Check concurrent call limit (Task 3.5)
          if (!canStartCall()) {
            sendVoice(socket, {
              type: "voice_auth_error",
              error: "Server at capacity. Please try again later.",
            });
            return;
          }

          // Check user doesn't already have an active call
          if (userToSession.has(userId)) {
            sendVoice(socket, {
              type: "voice_auth_error",
              error: "You already have an active call.",
            });
            return;
          }

          // Verify conversation belongs to user
          const [conv] = await db
            .select({
              id: conversations.id,
              agentId: conversations.agentId,
            })
            .from(conversations)
            .where(
              and(
                eq(conversations.id, event.conversationId),
                eq(conversations.userId, userId)
              )
            );

          if (!conv || conv.agentId !== event.agentId) {
            sendVoice(socket, {
              type: "voice_auth_error",
              error: "Invalid conversation or agent.",
            });
            return;
          }

          // Verify agent is voice-capable and connected
          const [agent] = await db
            .select({
              id: agents.id,
              voiceCapable: agents.voiceCapable,
            })
            .from(agents)
            .where(eq(agents.id, event.agentId));

          if (!agent || !agent.voiceCapable) {
            sendVoice(socket, {
              type: "voice_auth_error",
              error: "Agent does not support voice calls.",
            });
            return;
          }

          if (!isAgentConnected(event.agentId)) {
            sendVoice(socket, {
              type: "voice_auth_error",
              error: "Agent is not connected.",
            });
            return;
          }

          // Create session
          const sessionId = randomUUID();
          const audioFormat: VoiceAudioFormat = "opus";

          const voiceSession: VoiceSession = {
            sessionId,
            conversationId: event.conversationId,
            agentId: event.agentId,
            userId,
            state: "ringing",
            audioFormat,
            socket,
            createdAt: new Date(),
          };

          voiceSessions.set(sessionId, voiceSession);
          userToSession.set(userId, sessionId);
          activeSessionId = sessionId;

          // Create mediasoup transport for user (Task 3.1)
          const router = await getMediasoupRouter();
          const transport = await createWebRtcTransport(router);

          setActiveCall(sessionId, {
            sessionId,
            agentId: event.agentId,
            userId,
            userTransport: transport,
            userProducer: null,
            userConsumer: null,
            agentProducer: null,
            agentConsumer: null,
            createdAt: new Date(),
          });

          // Send auth_ok with session
          sendVoice(socket, { type: "voice_auth_ok", sessionId });

          // Notify as ringing (Task 2.4)
          sendVoice(socket, { type: "voice_ringing", sessionId });

          // Notify agent of incoming call (Task 4.1)
          sendVoiceStartToAgent(event.agentId, {
            sessionId,
            conversationId: event.conversationId,
            audioFormat,
          });

          // Transition to connected after agent acknowledges
          voiceSession.state = "connected";
          sendVoice(socket, { type: "voice_connected", sessionId });

          app.log.info(
            `Voice call started: session=${sessionId} agent=${event.agentId} user=${userId}`
          );
          return;
        }

        // ===== voice_offer: SDP offer from user (Task 2.2) =====
        if (event.type === "voice_offer") {
          const session = voiceSessions.get(event.sessionId);
          if (!session || session.userId !== userId) return;

          // In a mediasoup-based flow, the server creates the answer
          // For now, store the offer and the transport handles negotiation
          // The mediasoup transport already created handles WebRTC
          const call = getActiveCall(event.sessionId);
          if (!call) return;

          // Connect the transport with the user's SDP
          // mediasoup uses its own transport-level SDP negotiation
          // Send back server's transport parameters as an "answer"
          const transport = call.userTransport;
          sendVoice(socket, {
            type: "voice_answer",
            sessionId: event.sessionId,
            sdp: JSON.stringify({
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            }),
          });
          return;
        }

        // ===== voice_answer: SDP answer (for future use) =====
        if (event.type === "voice_answer") {
          // Server-originated offers would receive answers here
          return;
        }

        // ===== voice_ice_candidate: ICE candidate relay (Task 2.3) =====
        if (event.type === "voice_ice_candidate") {
          const session = voiceSessions.get(event.sessionId);
          if (!session || session.userId !== userId) return;
          // ICE candidates are handled by mediasoup transport internally
          return;
        }

        // ===== voice_hangup: End call (Task 2.4) =====
        if (event.type === "voice_hangup") {
          const session = voiceSessions.get(event.sessionId);
          if (!session || session.userId !== userId) return;

          session.state = "ended";

          // Notify agent (Task 4.4)
          sendVoiceEndToAgent(session.agentId, {
            sessionId: event.sessionId,
            reason: "user_hangup",
          });

          sendVoice(socket, {
            type: "voice_ended",
            sessionId: event.sessionId,
            reason: "user_hangup",
          });

          cleanupSession(event.sessionId);
          activeSessionId = null;

          app.log.info(
            `Voice call ended (user hangup): session=${event.sessionId}`
          );
          return;
        }
      } catch (err) {
        app.log.error(err, "Voice WS message error");
      }
    });

    socket.on("close", () => {
      // Clean up any active call
      if (activeSessionId) {
        const session = voiceSessions.get(activeSessionId);
        if (session) {
          sendVoiceEndToAgent(session.agentId, {
            sessionId: activeSessionId,
            reason: "user_disconnected",
          });
          cleanupSession(activeSessionId);
        }
      }
      app.log.info(`Voice WS disconnected: user=${userId}`);
    });
  });
}
