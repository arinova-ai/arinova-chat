import { PieceType, Piece, Position } from "./types";

// Map piece type to cell color value (1-7)
export const PIECE_COLORS: Record<PieceType, number> = {
  I: 1, // cyan
  O: 2, // yellow
  T: 3, // purple
  S: 4, // green
  Z: 5, // red
  J: 6, // blue
  L: 7, // orange
};

// Each piece has 4 rotation states (shape matrices)
// 1 = filled cell, 0 = empty
const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
};

// Bag-of-7 randomizer: ensures each of the 7 pieces appears once per bag
export function createBag(): PieceType[] {
  const pieces: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];
  // Fisher-Yates shuffle
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
}

export function createPiece(type: PieceType): Piece {
  const shape = SHAPES[type][0];
  // Spawn at top center
  const x = Math.floor((10 - shape[0].length) / 2);
  return {
    type,
    shape: SHAPES[type][0].map(r => [...r]),
    position: { x, y: 0 },
    rotation: 0,
  };
}

export function getRotatedShape(type: PieceType, rotation: number): number[][] {
  return SHAPES[type][rotation % 4].map(r => [...r]);
}

export function getShape(type: PieceType, rotation: number): number[][] {
  return SHAPES[type][rotation % 4];
}
