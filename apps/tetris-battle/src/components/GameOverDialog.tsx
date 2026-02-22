"use client";

interface GameOverDialogProps {
  winner: "player" | "ai";
  playerScore: number;
  aiScore: number;
  coinsChange: number;
  onPlayAgain: () => void;
  onExit: () => void;
}

export function GameOverDialog({
  winner,
  playerScore,
  aiScore,
  coinsChange,
  onPlayAgain,
  onExit,
}: GameOverDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-8 text-center">
        {/* Result */}
        <div className="mb-6">
          <div className={`text-5xl font-black ${winner === "player" ? "text-green-400" : "text-red-400"}`}>
            {winner === "player" ? "YOU WIN!" : "YOU LOSE"}
          </div>
        </div>

        {/* Scores */}
        <div className="mb-6 flex justify-center gap-8">
          <div>
            <div className="text-xs text-neutral-400">You</div>
            <div className="text-2xl font-bold">{playerScore.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400">AI</div>
            <div className="text-2xl font-bold">{aiScore.toLocaleString()}</div>
          </div>
        </div>

        {/* Coins */}
        <div className={`mb-8 text-lg font-semibold ${coinsChange >= 0 ? "text-green-400" : "text-red-400"}`}>
          {coinsChange >= 0 ? "+" : ""}{coinsChange} coins
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onPlayAgain}
            className="w-full rounded-lg bg-white px-6 py-3 font-semibold text-black transition-colors hover:bg-neutral-200"
          >
            Play Again
          </button>
          <button
            onClick={onExit}
            className="w-full rounded-lg border border-neutral-600 px-6 py-3 font-semibold text-neutral-300 transition-colors hover:bg-neutral-800"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
