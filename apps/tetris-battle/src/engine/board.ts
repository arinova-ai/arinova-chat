import { Board, CellValue, BOARD_WIDTH, BOARD_HEIGHT, Piece, ClearResult } from "./types";
import { PIECE_COLORS } from "./pieces";

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => 0 as CellValue)
  );
}

export function isValidPosition(board: Board, piece: Piece): boolean {
  const { shape, position } = piece;
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const newX = position.x + col;
        const newY = position.y + row;
        if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) return false;
        if (newY < 0) continue; // allow above board
        if (board[newY][newX] !== 0) return false;
      }
    }
  }
  return true;
}

export function placePiece(board: Board, piece: Piece): Board {
  const newBoard = board.map(r => [...r]);
  const { shape, position, type } = piece;
  const color = PIECE_COLORS[type] as CellValue;
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const y = position.y + row;
        const x = position.x + col;
        if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
          newBoard[y][x] = color;
        }
      }
    }
  }
  return newBoard;
}

export function clearLines(board: Board): { newBoard: Board; result: ClearResult } {
  const newBoard = board.filter(row => row.some(cell => cell === 0));
  const linesCleared = BOARD_HEIGHT - newBoard.length;

  // Add empty rows at top
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array.from({ length: BOARD_WIDTH }, () => 0 as CellValue));
  }

  // Calculate garbage to send
  const GARBAGE_TABLE: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 4 };
  const garbageToSend = GARBAGE_TABLE[linesCleared] ?? 0;

  return {
    newBoard,
    result: { linesCleared, garbageToSend },
  };
}

export function addGarbageLines(board: Board, count: number): Board {
  if (count <= 0) return board;
  const newBoard = board.slice(count); // remove top rows
  for (let i = 0; i < count; i++) {
    const garbageRow = Array.from({ length: BOARD_WIDTH }, () => 8 as CellValue); // gray
    const holeIndex = Math.floor(Math.random() * BOARD_WIDTH);
    garbageRow[holeIndex] = 0 as CellValue;
    newBoard.push(garbageRow as CellValue[]);
  }
  return newBoard;
}

export function getGhostPosition(board: Board, piece: Piece): number {
  let ghostY = piece.position.y;
  while (true) {
    const next = { ...piece, position: { ...piece.position, y: ghostY + 1 } };
    if (!isValidPosition(board, next)) break;
    ghostY++;
  }
  return ghostY;
}

// Serialize board for AI prompt
export function serializeBoard(board: Board): string {
  return board.map(row => row.map(cell => (cell === 0 ? "." : "#")).join("")).join("\n");
}
