export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 0=empty, 1-7=piece colors, 8=garbage gray

export type Board = CellValue[][];

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export interface Position {
  x: number;
  y: number;
}

export interface Piece {
  type: PieceType;
  shape: number[][];
  position: Position;
  rotation: number; // 0-3
}

export type MoveCommand = "left" | "right" | "rotate_cw" | "rotate_ccw" | "soft_drop" | "hard_drop";

export interface GameState {
  board: Board;
  currentPiece: Piece | null;
  nextPieces: PieceType[]; // next 3 pieces
  heldPiece: PieceType | null;
  canHold: boolean;
  score: number;
  level: number;
  linesCleared: number;
  linesSent: number; // lines sent to opponent
  pendingGarbage: number; // garbage lines waiting to be added
  isGameOver: boolean;
  tickInterval: number; // ms between auto-drops
}

export interface ClearResult {
  linesCleared: number;
  garbageToSend: number; // garbage lines to send to opponent
}
