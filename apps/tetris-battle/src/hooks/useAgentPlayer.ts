"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { serializeBoard } from "@/engine/board";
import type { GameState, MoveCommand } from "@/engine/types";

const AI_POLL_INTERVAL = 2000; // 2 seconds
const AI_TIMEOUT = 5000; // 5 seconds timeout

interface UseAgentPlayerOptions {
  agentId: string | null;
  accessToken: string | null;
  gameState: GameState | null;
  onMoves: (moves: MoveCommand[]) => void;
  enabled: boolean;
}

// Parse AI response text into move commands
function parseAIMoves(response: string): MoveCommand[] {
  const moves: MoveCommand[] = [];
  const words = response.toLowerCase().split(/[\s,;]+/);

  for (const word of words) {
    switch (word) {
      case "left":
        moves.push("left");
        break;
      case "right":
        moves.push("right");
        break;
      case "rotate":
      case "cw":
      case "rotate_cw":
        moves.push("rotate_cw");
        break;
      case "ccw":
      case "rotate_ccw":
        moves.push("rotate_ccw");
        break;
      case "drop":
      case "hard_drop":
      case "harddrop":
        moves.push("hard_drop");
        break;
      case "soft":
      case "down":
      case "soft_drop":
        moves.push("soft_drop");
        break;
    }
  }

  // If no drop command, auto add hard_drop
  if (!moves.some(m => m === "hard_drop" || m === "soft_drop")) {
    moves.push("hard_drop");
  }

  return moves;
}

function buildPrompt(state: GameState): string {
  const boardStr = serializeBoard(state.board);
  const currentPiece = state.currentPiece?.type ?? "none";
  const nextPiece = state.nextPieces[0] ?? "none";

  return `You are playing Tetris. Here is your current board (10 columns x 20 rows, # = filled, . = empty):

${boardStr}

Current piece: ${currentPiece} (at column ${state.currentPiece?.position.x ?? 0})
Next piece: ${nextPiece}
Score: ${state.score}
Lines cleared: ${state.linesCleared}

Respond with ONLY the moves to place the current piece. Available moves: left, right, rotate, drop
Example responses:
- "left left rotate drop"
- "right right right drop"
- "rotate left drop"
- "drop"

Your moves:`;
}

export function useAgentPlayer({
  agentId,
  accessToken,
  gameState,
  onMoves,
  enabled,
}: UseAgentPlayerOptions) {
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pollAgent = useCallback(async () => {
    if (!agentId || !accessToken || !gameState || gameState.isGameOver || !enabled) return;

    setThinking(true);
    setError(null);

    try {
      abortRef.current = new AbortController();
      const timeoutId = setTimeout(() => abortRef.current?.abort(), AI_TIMEOUT);

      const prompt = buildPrompt(gameState);

      // Use the Arinova SDK base URL (from env or default)
      const baseUrl = process.env.NEXT_PUBLIC_ARINOVA_API_URL || "http://localhost:21001";
      const response = await fetch(`${baseUrl}/api/v1/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          agentId,
          prompt,
        }),
        signal: abortRef.current.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503) {
          setConnected(false);
          setError("Agent not connected");
          // Fallback: auto hard drop
          onMoves(["hard_drop"]);
          return;
        }
        throw new Error(`API error: ${response.status}`);
      }

      setConnected(true);
      const data = await response.json() as { response: string };
      const moves = parseAIMoves(data.response);
      onMoves(moves);
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Timeout — auto drop
        onMoves(["hard_drop"]);
      } else {
        setError(err.message);
        // Fallback on error
        onMoves(["hard_drop"]);
      }
    } finally {
      setThinking(false);
    }
  }, [agentId, accessToken, gameState, onMoves, enabled]);

  // Poll on interval
  useEffect(() => {
    if (!enabled || !agentId || !accessToken || !gameState || gameState.isGameOver) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Initial poll
    pollAgent();

    timerRef.current = setInterval(pollAgent, AI_POLL_INTERVAL);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [enabled, agentId, accessToken, gameState?.isGameOver]);

  return { thinking, error, connected };
}
