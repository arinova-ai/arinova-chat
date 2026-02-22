"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useGame } from "./useGame";

type BattlePhase = "idle" | "countdown" | "playing" | "gameover";
type Winner = "player" | "ai" | null;

interface BattleResult {
  winner: Winner;
  playerScore: number;
  aiScore: number;
}

export function useBattleManager() {
  const [phase, setPhase] = useState<BattlePhase>("idle");
  const [result, setResult] = useState<BattleResult | null>(null);

  // Use refs to break circular dependency between player and ai
  const playerGarbageRef = useRef<(count: number) => void>(() => {});
  const aiGarbageRef = useRef<(count: number) => void>(() => {});

  const player = useGame({
    enableKeyboard: true,
    onLinesSent: useCallback((count: number) => {
      aiGarbageRef.current(count);
    }, []),
  });

  const ai = useGame({
    enableKeyboard: false,
    onLinesSent: useCallback((count: number) => {
      playerGarbageRef.current(count);
    }, []),
  });

  // Wire up refs after both hooks are created
  useEffect(() => {
    playerGarbageRef.current = player.receiveGarbage;
    aiGarbageRef.current = ai.receiveGarbage;
  }, [player.receiveGarbage, ai.receiveGarbage]);

  // Watch for game over
  useEffect(() => {
    if (phase !== "playing") return;

    const playerOver = player.state?.isGameOver ?? false;
    const aiOver = ai.state?.isGameOver ?? false;

    if (playerOver || aiOver) {
      let winner: Winner = null;
      if (playerOver && !aiOver) winner = "ai";
      else if (!playerOver && aiOver) winner = "player";
      else {
        // Both game over — higher score wins
        winner = (player.state?.score ?? 0) >= (ai.state?.score ?? 0) ? "player" : "ai";
      }

      setResult({
        winner,
        playerScore: player.state?.score ?? 0,
        aiScore: ai.state?.score ?? 0,
      });
      setPhase("gameover");
    }
  }, [phase, player.state?.isGameOver, ai.state?.isGameOver, player.state?.score, ai.state?.score]);

  const startBattle = useCallback(() => {
    setPhase("countdown");
    setResult(null);
  }, []);

  const onCountdownComplete = useCallback(() => {
    player.startGame();
    ai.startGame();
    setPhase("playing");
  }, [player, ai]);

  const resetBattle = useCallback(() => {
    player.stopGame();
    ai.stopGame();
    setPhase("idle");
    setResult(null);
  }, [player, ai]);

  return {
    phase,
    result,
    player,
    ai,
    startBattle,
    onCountdownComplete,
    resetBattle,
  };
}
