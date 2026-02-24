/** Skill metadata declared by the agent. */
export interface AgentSkill {
  /** Unique skill identifier (used as slash command, e.g. "draw"). */
  id: string;
  /** Human-readable skill name. */
  name: string;
  /** Short description of what the skill does. */
  description: string;
}

/** Options for creating an ArinovaAgent. */
export interface ArinovaAgentOptions {
  /** WebSocket server URL (e.g. "wss://chat.arinova.ai" or "ws://localhost:3501"). */
  serverUrl: string;
  /** Bot token from the Arinova dashboard. */
  botToken: string;
  /** Skills this agent supports — shown as slash commands to users. */
  skills?: AgentSkill[];
  /** Reconnect interval in ms (default: 5000). */
  reconnectInterval?: number;
  /** Ping interval in ms (default: 30000). */
  pingInterval?: number;
}

/** Context passed to the task handler. */
export interface TaskContext {
  /** Unique task ID assigned by the server. */
  taskId: string;
  /** Conversation ID this task belongs to. */
  conversationId: string;
  /** The user's message content. */
  content: string;
  /** Conversation type: "direct" or "group". */
  conversationType?: string;
  /** User ID of the human who sent the message. */
  senderUserId?: string;
  /** Username of the human who sent the message. */
  senderUsername?: string;
  /** Other agents in the conversation (for group conversations). */
  members?: { agentId: string; agentName: string }[];
  /** The message being replied to, if this is a reply. */
  replyTo?: { role: string; content: string; senderAgentName?: string };
  /** Recent conversation history (up to 5 messages before the current one). */
  history?: { role: string; content: string; senderAgentName?: string; senderUsername?: string; createdAt: string }[];
  /** Attachments from the user's message (images, files). Use the url to download. */
  attachments?: TaskAttachment[];
  /** Send a streaming delta (new characters only) to the user. */
  sendChunk: (delta: string) => void;
  /** Mark the task as complete with the full response content. */
  sendComplete: (content: string, options?: { mentions?: string[] }) => void;
  /** Mark the task as failed with an error message. */
  sendError: (error: string) => void;
  /** AbortSignal that fires when the user cancels the stream. Check signal.aborted or listen to signal.addEventListener('abort', ...) to stop generation early. */
  signal: AbortSignal;
  /** Upload a file to R2 storage. Returns the public URL and file metadata. */
  uploadFile: (
    file: Uint8Array,
    fileName: string,
    fileType?: string,
  ) => Promise<UploadResult>;
}

/** An attachment from the user's message. */
export interface TaskAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** Public URL to download the attachment. */
  url: string;
}

/** Result from uploading a file. */
export interface UploadResult {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** Task handler function. */
export type TaskHandler = (task: TaskContext) => void | Promise<void>;

/** Agent lifecycle event types. */
export type AgentEvent = "connected" | "disconnected" | "error";

/** Event listener signatures. */
export type AgentEventListener<T extends AgentEvent> = T extends "error"
  ? (error: Error) => void
  : () => void;
