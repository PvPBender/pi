export interface SessionRecord {
  date: string;
  digitsReached: number;
  avgLatencyMs: number;
  errors: number;
  durationMs: number;
}

export interface ChunkState {
  chunkIndex: number;
  easeFactor: number;      // SM-2 ease factor, starts at 2.5
  interval: number;        // days until next review
  nextReview: number;      // timestamp (ms) of next review
  correctStreak: number;
  totalReviews: number;
  totalCorrect: number;
}

export interface AppState {
  bestDigit: number;
  sessions: SessionRecord[];
  dailyGoal: number;
  todayDigitsLearned: number;
  todayDate: string;
  chunks: ChunkState[];
  learnedChunkCount: number; // how many chunks have been introduced in Learn mode
  numpadLayout: "phone" | "calculator"; // phone=123 top, calculator=789 top (123 bottom)
}

const STORAGE_KEY = "pi-trainer-state";

const defaultState: AppState = {
  bestDigit: 0,
  sessions: [],
  dailyGoal: 50,
  todayDigitsLearned: 0,
  todayDate: new Date().toISOString().slice(0, 10),
  chunks: [],
  learnedChunkCount: 0,
  numpadLayout: "calculator",
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const state = JSON.parse(raw) as AppState;
    // Reset daily counter if new day
    const today = new Date().toISOString().slice(0, 10);
    if (state.todayDate !== today) {
      state.todayDigitsLearned = 0;
      state.todayDate = today;
    }
    // Ensure new fields exist for old state
    if (!state.chunks) state.chunks = [];
    if (state.learnedChunkCount == null) state.learnedChunkCount = 0;
    if (!state.numpadLayout) state.numpadLayout = "calculator";
    return state;
  } catch {
    return { ...defaultState };
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getChunkState(state: AppState, chunkIndex: number): ChunkState {
  const existing = state.chunks.find((c) => c.chunkIndex === chunkIndex);
  if (existing) return existing;
  return {
    chunkIndex,
    easeFactor: 2.5,
    interval: 0,
    nextReview: 0,
    correctStreak: 0,
    totalReviews: 0,
    totalCorrect: 0,
  };
}

export function updateChunkState(state: AppState, chunk: ChunkState): AppState {
  const idx = state.chunks.findIndex((c) => c.chunkIndex === chunk.chunkIndex);
  const newChunks = [...state.chunks];
  if (idx >= 0) {
    newChunks[idx] = chunk;
  } else {
    newChunks.push(chunk);
  }
  return { ...state, chunks: newChunks };
}

// SM-2 algorithm: grade 0-5, returns updated chunk
export function sm2Update(chunk: ChunkState, grade: number): ChunkState {
  const now = Date.now();
  let { easeFactor, interval, correctStreak } = chunk;

  if (grade >= 3) {
    // Correct
    if (correctStreak === 0) {
      interval = 1;
    } else if (correctStreak === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    correctStreak += 1;
  } else {
    // Incorrect — reset
    correctStreak = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  return {
    ...chunk,
    easeFactor,
    interval,
    nextReview: now + interval * 24 * 60 * 60 * 1000,
    correctStreak,
    totalReviews: chunk.totalReviews + 1,
    totalCorrect: grade >= 3 ? chunk.totalCorrect + 1 : chunk.totalCorrect,
  };
}
