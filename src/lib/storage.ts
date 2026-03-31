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
  lastLatencyMs?: number;  // last response time for this chunk
}

export interface DailyRecord {
  date: string;                 // YYYY-MM-DD
  digitsLearned: number;
  chunksReviewed: number;
  totalPracticeMs: number;
  avgLatencyMs: number;
  errorsTotal: number;
  bestDigitReached: number;
}

export interface AppSettings {
  numpadLayout: "phone" | "calculator";
  dailyGoal: number;
  chunkSize: 5 | 10;
  reviewBatchSize: number;
  showRecordMilestones: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  targetSpeed: number;        // target ms per digit for speed drills
}

export interface AppState {
  bestDigit: number;
  sessions: SessionRecord[];
  dailyGoal: number;
  todayDigitsLearned: number;
  todayDate: string;
  chunks: Record<number, ChunkState>;
  learnedChunkCount: number;
  numpadLayout: "phone" | "calculator"; // kept for compat, canonical is settings.numpadLayout

  // Daily tracking
  dailyHistory: DailyRecord[];

  // Settings
  settings: AppSettings;

  // Streak tracking
  currentDayStreak: number;
  lastPracticeDate: string;   // YYYY-MM-DD

  // Weak chunks cache
  weakChunks: number[];
}

const STORAGE_KEY = "pi-trainer-state";

const defaultSettings: AppSettings = {
  numpadLayout: "calculator",
  dailyGoal: 50,
  chunkSize: 5,
  reviewBatchSize: 50,
  showRecordMilestones: true,
  soundEnabled: true,
  hapticsEnabled: true,
  targetSpeed: 500,
};

const defaultState: AppState = {
  bestDigit: 0,
  sessions: [],
  dailyGoal: 50,
  todayDigitsLearned: 0,
  todayDate: new Date().toISOString().slice(0, 10),
  chunks: {},
  learnedChunkCount: 0,
  numpadLayout: "calculator",
  dailyHistory: [],
  settings: { ...defaultSettings },
  currentDayStreak: 0,
  lastPracticeDate: "",
  weakChunks: [],
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// Migrate old array-based chunks to Record-based
function migrateChunks(raw: any): Record<number, ChunkState> {
  if (Array.isArray(raw)) {
    const record: Record<number, ChunkState> = {};
    for (const c of raw) {
      if (c && typeof c.chunkIndex === "number") {
        record[c.chunkIndex] = c;
      }
    }
    return record;
  }
  if (raw && typeof raw === "object") {
    return raw as Record<number, ChunkState>;
  }
  return {};
}

function migrateSettings(raw: any, numpadLayout?: string): AppSettings {
  const base = { ...defaultSettings };
  if (raw && typeof raw === "object") {
    if (raw.numpadLayout) base.numpadLayout = raw.numpadLayout;
    if (typeof raw.dailyGoal === "number") base.dailyGoal = raw.dailyGoal;
    if (raw.chunkSize === 5 || raw.chunkSize === 10) base.chunkSize = raw.chunkSize;
    if (typeof raw.reviewBatchSize === "number") base.reviewBatchSize = raw.reviewBatchSize;
    if (typeof raw.showRecordMilestones === "boolean") base.showRecordMilestones = raw.showRecordMilestones;
    if (typeof raw.soundEnabled === "boolean") base.soundEnabled = raw.soundEnabled;
    if (typeof raw.hapticsEnabled === "boolean") base.hapticsEnabled = raw.hapticsEnabled;
    if (typeof raw.targetSpeed === "number") base.targetSpeed = raw.targetSpeed;
  } else if (numpadLayout) {
    // Migrate old top-level numpadLayout into settings
    base.numpadLayout = numpadLayout as "phone" | "calculator";
  }
  return base;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState, todayDate: getToday() };
    const data = JSON.parse(raw);

    const today = getToday();

    // Migrate chunks from array to Record
    const chunks = migrateChunks(data.chunks);

    // Migrate settings
    const settings = migrateSettings(data.settings, data.numpadLayout);

    // If old state had dailyGoal at top level, bring it into settings
    if (typeof data.dailyGoal === "number" && !data.settings) {
      settings.dailyGoal = data.dailyGoal;
    }

    // Cap sessions at 200
    let sessions: SessionRecord[] = Array.isArray(data.sessions) ? data.sessions : [];
    if (sessions.length > 200) {
      sessions = sessions.slice(-200);
    }

    // Streak calculation
    let currentDayStreak = data.currentDayStreak || 0;
    let lastPracticeDate = data.lastPracticeDate || "";

    const state: AppState = {
      bestDigit: data.bestDigit || 0,
      sessions,
      dailyGoal: settings.dailyGoal,
      todayDigitsLearned: data.todayDate === today ? (data.todayDigitsLearned || 0) : 0,
      todayDate: today,
      chunks,
      learnedChunkCount: data.learnedChunkCount || 0,
      numpadLayout: settings.numpadLayout,
      dailyHistory: Array.isArray(data.dailyHistory) ? data.dailyHistory : [],
      settings,
      currentDayStreak,
      lastPracticeDate,
      weakChunks: Array.isArray(data.weakChunks) ? data.weakChunks : [],
    };

    return state;
  } catch {
    return { ...defaultState, todayDate: getToday() };
  }
}

export function saveState(state: AppState): void {
  // Keep numpadLayout in sync
  state.numpadLayout = state.settings.numpadLayout;
  state.dailyGoal = state.settings.dailyGoal;

  // Cap sessions
  if (state.sessions.length > 200) {
    state.sessions = state.sessions.slice(-200);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getChunkState(state: AppState, chunkIndex: number): ChunkState {
  const existing = state.chunks[chunkIndex];
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
  return {
    ...state,
    chunks: {
      ...state.chunks,
      [chunk.chunkIndex]: chunk,
    },
  };
}

// Fast Map access for iteration-heavy code
export function getChunkMap(state: AppState): Map<number, ChunkState> {
  const map = new Map<number, ChunkState>();
  for (const key of Object.keys(state.chunks)) {
    const idx = Number(key);
    map.set(idx, state.chunks[idx]);
  }
  return map;
}

// Update multiple chunks at once
export function updateChunkMap(state: AppState, updates: Map<number, ChunkState>): AppState {
  const newChunks = { ...state.chunks };
  for (const [idx, chunk] of updates) {
    newChunks[idx] = chunk;
  }
  return { ...state, chunks: newChunks };
}

// Get all chunk states as array (for iteration)
export function getChunkArray(state: AppState): ChunkState[] {
  return Object.values(state.chunks);
}

// Update streak tracking
export function updateStreak(state: AppState): AppState {
  const today = getToday();
  if (state.lastPracticeDate === today) return state; // already tracked today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let newStreak = state.currentDayStreak;
  if (state.lastPracticeDate === yesterdayStr) {
    newStreak += 1;
  } else if (state.lastPracticeDate !== today) {
    newStreak = 1; // reset streak
  }

  return {
    ...state,
    currentDayStreak: newStreak,
    lastPracticeDate: today,
  };
}

// Update today's daily record
export function updateDailyRecord(
  state: AppState,
  updates: Partial<Omit<DailyRecord, "date">>
): AppState {
  const today = getToday();
  const history = [...state.dailyHistory];
  let todayRecord = history.find((r) => r.date === today);

  if (!todayRecord) {
    todayRecord = {
      date: today,
      digitsLearned: 0,
      chunksReviewed: 0,
      totalPracticeMs: 0,
      avgLatencyMs: 0,
      errorsTotal: 0,
      bestDigitReached: state.bestDigit,
    };
    history.push(todayRecord);
  }

  if (updates.digitsLearned !== undefined)
    todayRecord.digitsLearned += updates.digitsLearned;
  if (updates.chunksReviewed !== undefined)
    todayRecord.chunksReviewed += updates.chunksReviewed;
  if (updates.totalPracticeMs !== undefined)
    todayRecord.totalPracticeMs += updates.totalPracticeMs;
  if (updates.errorsTotal !== undefined)
    todayRecord.errorsTotal += updates.errorsTotal;
  if (updates.bestDigitReached !== undefined)
    todayRecord.bestDigitReached = Math.max(todayRecord.bestDigitReached, updates.bestDigitReached);
  if (updates.avgLatencyMs !== undefined && updates.avgLatencyMs > 0) {
    // Running average
    const prevTotal = todayRecord.avgLatencyMs * (todayRecord.chunksReviewed - (updates.chunksReviewed || 0));
    const newTotal = prevTotal + updates.avgLatencyMs;
    todayRecord.avgLatencyMs = todayRecord.chunksReviewed > 0
      ? newTotal / todayRecord.chunksReviewed
      : updates.avgLatencyMs;
  }

  return { ...state, dailyHistory: history };
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

// Calculate weak chunks
export function calculateWeakChunks(state: AppState, count: number = 20): number[] {
  const chunkArr = getChunkArray(state);
  if (chunkArr.length === 0) return [];

  // Score each chunk: lower = weaker
  const scored = chunkArr
    .filter((c) => c.totalReviews > 0)
    .map((c) => {
      const accuracy = c.totalReviews > 0 ? c.totalCorrect / c.totalReviews : 0;
      const latencyPenalty = c.lastLatencyMs ? Math.min(c.lastLatencyMs / 5000, 1) : 0.5;
      const streakBonus = Math.min(c.correctStreak / 5, 1);
      // Lower score = weaker
      const score = accuracy * 0.5 + (1 - latencyPenalty) * 0.3 + streakBonus * 0.2;
      return { chunkIndex: c.chunkIndex, score };
    });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map((s) => s.chunkIndex);
}
