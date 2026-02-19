"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DualBoard } from "@/components/DualBoard";
import { Countdown } from "@/components/Countdown";
import { GameOverDialog } from "@/components/GameOverDialog";
import { useBattleManager } from "@/hooks/useBattleManager";
import { useAgentPlayer } from "@/hooks/useAgentPlayer";
import { getAccessToken } from "@/lib/arinova";

export default function GamePage() {
  const router = useRouter();
  const battle = useBattleManager();
  const [agentId, setAgentId] = useState<string | null>(null);
  const accessToken = getAccessToken();

  // Get agent ID from session storage
  useEffect(() => {
    const id = sessionStorage.getItem("tetris_agent_id");
    if (!id) {
      router.push("/");
      return;
    }
    setAgentId(id);
    // Auto-start countdown
    battle.startBattle();
  }, []);

  // AI player hook
  const agentPlayer = useAgentPlayer({
    agentId,
    accessToken,
    gameState: battle.ai.state,
    onMoves: useCallback((moves) => {
      battle.ai.executeMoves(moves);
    }, [battle.ai]),
    enabled: battle.phase === "playing",
  });

  const handlePlayAgain = () => {
    battle.resetBattle();
    setTimeout(() => battle.startBattle(), 100);
  };

  const handleExit = () => {
    battle.resetBattle();
    router.push("/");
  };

  // Calculate coins change
  const coinsChange = battle.result?.winner === "player" ? 10 : -10;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">
          TETRIS <span className="text-cyan-400">BATTLE</span>
        </h1>
        {battle.phase === "playing" && (
          <button
            onClick={battle.player.togglePause}
            className="rounded border border-neutral-600 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            {battle.player.paused ? "Resume" : "Pause"}
          </button>
        )}
        {agentPlayer.thinking && (
          <span className="text-xs text-cyan-400 animate-pulse">AI thinking...</span>
        )}
        {!agentPlayer.connected && (
          <span className="text-xs text-red-400">Agent disconnected</span>
        )}
      </div>

      {/* Game boards */}
      {battle.player.state && battle.ai.state && (
        <DualBoard
          playerState={battle.player.state}
          playerGhostY={battle.player.ghostY}
          aiState={battle.ai.state}
          aiGhostY={battle.ai.ghostY}
        />
      )}

      {/* Pause overlay */}
      {battle.player.paused && battle.phase === "playing" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="text-4xl font-bold">PAUSED</div>
            <p className="mt-2 text-neutral-400">Press Esc to resume</p>
          </div>
        </div>
      )}

      {/* Countdown */}
      {battle.phase === "countdown" && (
        <Countdown onComplete={battle.onCountdownComplete} />
      )}

      {/* Game Over */}
      {battle.phase === "gameover" && battle.result && (
        <GameOverDialog
          winner={battle.result.winner ?? "player"}
          playerScore={battle.result.playerScore}
          aiScore={battle.result.aiScore}
          coinsChange={coinsChange}
          onPlayAgain={handlePlayAgain}
          onExit={handleExit}
        />
      )}

      {/* Controls hint */}
      {battle.phase === "playing" && !battle.player.paused && (
        <div className="text-xs text-neutral-600">
          ← → Move · ↑ Rotate · Space Hard Drop · C Hold · Esc Pause
        </div>
      )}
    </div>
  );
}
