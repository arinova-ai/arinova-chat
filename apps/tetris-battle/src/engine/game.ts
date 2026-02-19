import { GameState, MoveCommand, Board, Piece, BOARD_WIDTH, BOARD_HEIGHT } from "./types";
import type { PieceType } from "./types";
import { createBag, createPiece, getRotatedShape, getShape } from "./pieces";
import { createBoard, isValidPosition, placePiece, clearLines, addGarbageLines } from "./board";

function fillNextPieces(nextPieces: PieceType[], bag: PieceType[]): { nextPieces: PieceType[]; bag: PieceType[] } {
  let currentBag = [...bag];
  const result = [...nextPieces];
  while (result.length < 3) {
    if (currentBag.length === 0) currentBag = createBag();
    result.push(currentBag.shift()!);
  }
  return { nextPieces: result, bag: currentBag };
}

export function createGameState(): GameState {
  let bag = createBag();
  const firstType = bag.shift()!;
  const { nextPieces, bag: remainingBag } = fillNextPieces([], bag);

  const currentPiece = createPiece(firstType);

  return {
    board: createBoard(),
    currentPiece,
    nextPieces,
    heldPiece: null,
    canHold: true,
    score: 0,
    level: 1,
    linesCleared: 0,
    linesSent: 0,
    pendingGarbage: 0,
    isGameOver: false,
    tickInterval: 1000,
    // Store bag internally
    _bag: remainingBag,
  } as GameState & { _bag: PieceType[] };
}

function getNextPiece(state: GameState): { piece: Piece; nextPieces: PieceType[]; bag: PieceType[] } {
  const bag = (state as any)._bag || [];
  const nextPieces = [...state.nextPieces];
  const nextType = nextPieces.shift()!;
  const { nextPieces: filled, bag: newBag } = fillNextPieces(nextPieces, bag);
  return { piece: createPiece(nextType), nextPieces: filled, bag: newBag };
}

// Calculate level from lines cleared
function calculateLevel(linesCleared: number): number {
  return Math.floor(linesCleared / 10) + 1;
}

// Calculate tick interval based on level (faster at higher levels)
function calculateTickInterval(level: number): number {
  return Math.max(100, 1000 - (level - 1) * 80);
}

// Score calculation
function calculateScore(linesCleared: number, level: number): number {
  const BASE = [0, 100, 300, 500, 800];
  return (BASE[linesCleared] ?? 0) * level;
}

export function applyMove(state: GameState, command: MoveCommand): GameState {
  if (state.isGameOver || !state.currentPiece) return state;

  const piece = state.currentPiece;

  switch (command) {
    case "left": {
      const moved = { ...piece, position: { ...piece.position, x: piece.position.x - 1 } };
      if (isValidPosition(state.board, moved)) {
        return { ...state, currentPiece: moved };
      }
      return state;
    }
    case "right": {
      const moved = { ...piece, position: { ...piece.position, x: piece.position.x + 1 } };
      if (isValidPosition(state.board, moved)) {
        return { ...state, currentPiece: moved };
      }
      return state;
    }
    case "rotate_cw": {
      const newRotation = (piece.rotation + 1) % 4;
      const newShape = getRotatedShape(piece.type, newRotation);
      const rotated = { ...piece, shape: newShape, rotation: newRotation };
      // Try basic rotation
      if (isValidPosition(state.board, rotated)) {
        return { ...state, currentPiece: rotated };
      }
      // Wall kick attempts
      for (const kickX of [-1, 1, -2, 2]) {
        const kicked = { ...rotated, position: { ...rotated.position, x: rotated.position.x + kickX } };
        if (isValidPosition(state.board, kicked)) {
          return { ...state, currentPiece: kicked };
        }
      }
      return state;
    }
    case "rotate_ccw": {
      const newRotation = (piece.rotation + 3) % 4;
      const newShape = getRotatedShape(piece.type, newRotation);
      const rotated = { ...piece, shape: newShape, rotation: newRotation };
      if (isValidPosition(state.board, rotated)) {
        return { ...state, currentPiece: rotated };
      }
      for (const kickX of [-1, 1, -2, 2]) {
        const kicked = { ...rotated, position: { ...rotated.position, x: rotated.position.x + kickX } };
        if (isValidPosition(state.board, kicked)) {
          return { ...state, currentPiece: kicked };
        }
      }
      return state;
    }
    case "soft_drop": {
      const moved = { ...piece, position: { ...piece.position, y: piece.position.y + 1 } };
      if (isValidPosition(state.board, moved)) {
        return { ...state, currentPiece: moved, score: state.score + 1 };
      }
      // Can't move down — lock the piece
      return lockPiece(state);
    }
    case "hard_drop": {
      let dropY = piece.position.y;
      while (true) {
        const next = { ...piece, position: { ...piece.position, y: dropY + 1 } };
        if (!isValidPosition(state.board, next)) break;
        dropY++;
      }
      const dropped = { ...piece, position: { ...piece.position, y: dropY } };
      const dropDistance = dropY - piece.position.y;
      return lockPiece({ ...state, currentPiece: dropped, score: state.score + dropDistance * 2 });
    }
  }
}

// Called every tick (gravity)
export function tick(state: GameState): GameState {
  if (state.isGameOver || !state.currentPiece) return state;
  return applyMove(state, "soft_drop");
}

function lockPiece(state: GameState): GameState {
  if (!state.currentPiece) return state;

  // Place piece on board
  let board = placePiece(state.board, state.currentPiece);

  // Clear lines
  const { newBoard, result } = clearLines(board);
  board = newBoard;

  // Calculate new score and lines
  const newLinesCleared = state.linesCleared + result.linesCleared;
  const newLevel = calculateLevel(newLinesCleared);
  const newScore = state.score + calculateScore(result.linesCleared, newLevel);

  // Handle garbage offset: if player cleared lines, reduce pending garbage first
  let garbageToSend = result.garbageToSend;
  let pendingGarbage = state.pendingGarbage;
  if (garbageToSend > 0 && pendingGarbage > 0) {
    const offset = Math.min(garbageToSend, pendingGarbage);
    garbageToSend -= offset;
    pendingGarbage -= offset;
  }

  // Add remaining pending garbage
  if (pendingGarbage > 0) {
    board = addGarbageLines(board, pendingGarbage);
    pendingGarbage = 0;
  }

  // Get next piece
  const { piece: nextPiece, nextPieces, bag } = getNextPiece(state);

  // Check game over
  if (!isValidPosition(board, nextPiece)) {
    return {
      ...state,
      board,
      currentPiece: null,
      nextPieces,
      score: newScore,
      level: newLevel,
      linesCleared: newLinesCleared,
      linesSent: state.linesSent + garbageToSend,
      pendingGarbage: 0,
      isGameOver: true,
      tickInterval: calculateTickInterval(newLevel),
      _bag: bag,
    } as any;
  }

  return {
    ...state,
    board,
    currentPiece: nextPiece,
    nextPieces,
    canHold: true,
    score: newScore,
    level: newLevel,
    linesCleared: newLinesCleared,
    linesSent: state.linesSent + garbageToSend,
    pendingGarbage: 0,
    tickInterval: calculateTickInterval(newLevel),
    _bag: bag,
  } as any;
}

export function addPendingGarbage(state: GameState, count: number): GameState {
  return { ...state, pendingGarbage: state.pendingGarbage + count };
}

export function holdPiece(state: GameState): GameState {
  if (!state.canHold || !state.currentPiece || state.isGameOver) return state;

  const currentType = state.currentPiece.type;

  if (state.heldPiece) {
    // Swap with held
    const newPiece = createPiece(state.heldPiece);
    if (!isValidPosition(state.board, newPiece)) return state;
    return {
      ...state,
      currentPiece: newPiece,
      heldPiece: currentType,
      canHold: false,
    };
  } else {
    // Hold current, get next
    const { piece: nextPiece, nextPieces, bag } = getNextPiece(state);
    return {
      ...state,
      currentPiece: nextPiece,
      nextPieces,
      heldPiece: currentType,
      canHold: false,
      _bag: bag,
    } as any;
  }
}
