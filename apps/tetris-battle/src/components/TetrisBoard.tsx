"use client";

import { useRef, useEffect } from "react";
import type { Board, Piece, CellValue } from "@/engine/types";

const CELL_SIZE = 28;
const GRID_COLOR = "#1a1a2e";
const GHOST_ALPHA = 0.3;

// Color map for piece types (by CellValue 1-8)
const COLORS: Record<number, string> = {
  1: "#00f0f0", // I - cyan
  2: "#f0f000", // O - yellow
  3: "#a000f0", // T - purple
  4: "#00f000", // S - green
  5: "#f00000", // Z - red
  6: "#0000f0", // J - blue
  7: "#f0a000", // L - orange
  8: "#808080", // garbage - gray
};

interface TetrisBoardProps {
  board: Board;
  currentPiece: Piece | null;
  ghostY?: number;
  width?: number;
  height?: number;
  cellSize?: number;
  label?: string;
}

export function TetrisBoard({
  board,
  currentPiece,
  ghostY,
  cellSize = CELL_SIZE,
  label,
}: TetrisBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cols = board[0]?.length ?? 10;
  const rows = board.length;
  const canvasWidth = cols * cellSize;
  const canvasHeight = rows * cellSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellSize);
      ctx.lineTo(canvasWidth, r * cellSize);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellSize, 0);
      ctx.lineTo(c * cellSize, canvasHeight);
      ctx.stroke();
    }

    // Draw board cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        if (cell !== 0) {
          drawCell(ctx, c, r, COLORS[cell] || "#fff", cellSize);
        }
      }
    }

    // Draw ghost piece
    if (currentPiece && ghostY !== undefined) {
      const { shape, position, type } = currentPiece;
      ctx.globalAlpha = GHOST_ALPHA;
      const colorIdx = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[type] || 1;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            drawCell(ctx, position.x + c, ghostY + r, COLORS[colorIdx], cellSize);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Draw current piece
    if (currentPiece) {
      const { shape, position, type } = currentPiece;
      const colorIdx = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[type] || 1;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const y = position.y + r;
            if (y >= 0) {
              drawCell(ctx, position.x + c, y, COLORS[colorIdx], cellSize);
            }
          }
        }
      }
    }
  }, [board, currentPiece, ghostY, cellSize, canvasWidth, canvasHeight, cols, rows]);

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {label}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: canvasWidth, height: canvasHeight }}
        className="rounded border border-neutral-700"
      />
    </div>
  );
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number) {
  const padding = 1;
  ctx.fillStyle = color;
  ctx.fillRect(x * size + padding, y * size + padding, size - padding * 2, size - padding * 2);
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(x * size + padding, y * size + padding, size - padding * 2, 2);
  ctx.fillRect(x * size + padding, y * size + padding, 2, size - padding * 2);
}
