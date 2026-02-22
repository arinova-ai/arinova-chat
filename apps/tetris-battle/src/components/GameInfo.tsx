"use client";

import type { PieceType } from "@/engine/types";

const PIECE_PREVIEWS: Record<PieceType, number[][]> = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]],
};

const PIECE_COLORS: Record<PieceType, string> = {
  I: "#00f0f0",
  O: "#f0f000",
  T: "#a000f0",
  S: "#00f000",
  Z: "#f00000",
  J: "#0000f0",
  L: "#f0a000",
};

interface GameInfoProps {
  score: number;
  level: number;
  linesCleared: number;
  linesSent: number;
  nextPieces: PieceType[];
  heldPiece: PieceType | null;
  pendingGarbage: number;
}

export function GameInfo({
  score,
  level,
  linesCleared,
  linesSent,
  nextPieces,
  heldPiece,
  pendingGarbage,
}: GameInfoProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Hold */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Hold
        </div>
        <div className="flex h-14 w-20 items-center justify-center rounded border border-neutral-700 bg-neutral-900">
          {heldPiece ? <PiecePreview type={heldPiece} /> : <span className="text-neutral-600">—</span>}
        </div>
      </div>

      {/* Next */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Next
        </div>
        <div className="flex flex-col gap-2">
          {nextPieces.map((type, i) => (
            <div
              key={i}
              className="flex h-14 w-20 items-center justify-center rounded border border-neutral-700 bg-neutral-900"
            >
              <PiecePreview type={type} />
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <StatRow label="Score" value={score.toLocaleString()} />
        <StatRow label="Level" value={String(level)} />
        <StatRow label="Lines" value={String(linesCleared)} />
        <StatRow label="Sent" value={String(linesSent)} highlight />
        {pendingGarbage > 0 && (
          <StatRow label="Incoming" value={String(pendingGarbage)} danger />
        )}
      </div>
    </div>
  );
}

function PiecePreview({ type }: { type: PieceType }) {
  const shape = PIECE_PREVIEWS[type];
  const color = PIECE_COLORS[type];
  const cellSize = 10;
  return (
    <div className="flex flex-col gap-px">
      {shape.map((row, r) => (
        <div key={r} className="flex gap-px">
          {row.map((cell, c) => (
            <div
              key={c}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: cell ? color : "transparent",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function StatRow({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className={`font-mono font-bold ${danger ? "text-red-400" : highlight ? "text-yellow-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
