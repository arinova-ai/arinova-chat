"use client";

import { TetrisBoard } from "./TetrisBoard";
import { GameInfo } from "./GameInfo";
import type { GameState } from "@/engine/types";

interface DualBoardProps {
  playerState: GameState;
  playerGhostY?: number;
  aiState: GameState;
  aiGhostY?: number;
}

export function DualBoard({ playerState, playerGhostY, aiState, aiGhostY }: DualBoardProps) {
  return (
    <div className="flex items-start justify-center gap-8">
      {/* Player side */}
      <div className="flex items-start gap-4">
        <GameInfo
          score={playerState.score}
          level={playerState.level}
          linesCleared={playerState.linesCleared}
          linesSent={playerState.linesSent}
          nextPieces={playerState.nextPieces}
          heldPiece={playerState.heldPiece}
          pendingGarbage={playerState.pendingGarbage}
        />
        <TetrisBoard
          board={playerState.board}
          currentPiece={playerState.currentPiece}
          ghostY={playerGhostY}
          cellSize={28}
          label="You"
        />
      </div>

      {/* VS divider */}
      <div className="flex flex-col items-center justify-center self-center">
        <span className="text-2xl font-black text-neutral-600">VS</span>
      </div>

      {/* AI side */}
      <div className="flex items-start gap-3">
        <TetrisBoard
          board={aiState.board}
          currentPiece={aiState.currentPiece}
          ghostY={aiGhostY}
          cellSize={16}
          label="AI Agent"
        />
        <div className="flex flex-col gap-2 text-xs">
          <div>
            <span className="text-neutral-400">Score </span>
            <span className="font-mono font-bold">{aiState.score.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-neutral-400">Lines </span>
            <span className="font-mono font-bold">{aiState.linesCleared}</span>
          </div>
          <div>
            <span className="text-neutral-400">Sent </span>
            <span className="font-mono font-bold text-yellow-400">{aiState.linesSent}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
