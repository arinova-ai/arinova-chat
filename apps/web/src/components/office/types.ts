export type AgentStatus = "working" | "idle" | "blocked" | "collaborating";

export interface AgentTask {
  title: string;
  priority: string;
  due: string;
  assignedBy: string;
  progress: number;
  subtasks: { label: string; done: boolean }[];
}

export interface AgentActivity {
  time: string;
  text: string;
}

export interface AgentTokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  status: AgentStatus;
  collaboratingWith?: string[];
  currentTask?: AgentTask;
  recentActivity: AgentActivity[];
  model?: string;
  tokenUsage?: AgentTokenUsage;
  sessionDurationMs?: number;
  currentToolDetail?: string;
}
