"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createGameState, applyMove, tick, addPendingGarbage, holdPiece } from "@/engine/game";
import { getGhostPosition } from "@/engine/board";
import type { GameState, MoveCommand } from "@/engine/types";

interface UseGameOptions {
  enableKeyboard?: boolean; // only for player board
  onLinesSent?: (count: number) => void; // callback when lines are sent to opponent
}

export function useGame(options: UseGameOptions = {}) {
  const { enableKeyboard = false, onLinesSent } = options;
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const prevLinesSentRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Track lines sent changes
  useEffect(() => {
    if (!state) return;
    const diff = state.linesSent - prevLinesSentRef.current;
    if (diff > 0 && onLinesSent) {
      onLinesSent(diff);
    }
    prevLinesSentRef.current = state.linesSent;
  }, [state?.linesSent, onLinesSent]);

  const startGame = useCallback(() => {
    const initial = createGameState();
    setState(initial);
    stateRef.current = initial;
    prevLinesSentRef.current = 0;
    setPaused(false);
    pausedRef.current = false;
  }, []);

  const stopGame = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setState(null);
    stateRef.current = null;
  }, []);

  // Tick timer
  useEffect(() => {
    if (!state || state.isGameOver || paused) {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      return;
    }

    tickTimerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setState(prev => {
        if (!prev || prev.isGameOver) return prev;
        return tick(prev);
      });
    }, state.tickInterval);

    return () => {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [state?.tickInterval, state?.isGameOver, paused]);

  const executeMove = useCallback((command: MoveCommand) => {
    setState(prev => {
      if (!prev || prev.isGameOver) return prev;
      return applyMove(prev, command);
    });
  }, []);

  const executeMoves = useCallback((commands: MoveCommand[]) => {
    setState(prev => {
      if (!prev || prev.isGameOver) return prev;
      let s = prev;
      for (const cmd of commands) {
        if (s.isGameOver) break;
        s = applyMove(s, cmd);
      }
      return s;
    });
  }, []);

  const receiveGarbage = useCallback((count: number) => {
    setState(prev => {
      if (!prev || prev.isGameOver) return prev;
      return addPendingGarbage(prev, count);
    });
  }, []);

  const doHold = useCallback(() => {
    setState(prev => {
      if (!prev || prev.isGameOver) return prev;
      return holdPiece(prev);
    });
  }, []);

  const togglePause = useCallback(() => {
    setPaused(p => !p);
  }, []);

  // Keyboard input for player
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!stateRef.current || stateRef.current.isGameOver || pausedRef.current) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          executeMove("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          executeMove("right");
          break;
        case "ArrowDown":
          e.preventDefault();
          executeMove("soft_drop");
          break;
        case "ArrowUp":
          e.preventDefault();
          executeMove("rotate_cw");
          break;
        case "z":
        case "Z":
          e.preventDefault();
          executeMove("rotate_ccw");
          break;
        case " ":
          e.preventDefault();
          executeMove("hard_drop");
          break;
        case "c":
        case "C":
          e.preventDefault();
          doHold();
          break;
        case "Escape":
          e.preventDefault();
          togglePause();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableKeyboard, executeMove, doHold, togglePause]);

  // Calculate ghost Y for current piece
  const ghostY = state?.currentPiece
    ? getGhostPosition(state.board, state.currentPiece)
    : undefined;

  return {
    state,
    ghostY,
    paused,
    startGame,
    stopGame,
    executeMove,
    executeMoves,
    receiveGarbage,
    togglePause,
  };
}
