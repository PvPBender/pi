export interface SessionRecord {
  date: string;
  digitsReached: number;
  avgLatencyMs: number;
  errors: number;
  durationMs: number;
}

export interface AppState {
  bestDigit: number; // highest digit index successfully reached
  sessions: SessionRecord[];
  dailyGoal: number;
  todayDigitsLearned: number;
  todayDate: string;
}

const STORAGE_KEY = "pi-trainer-state";

const defaultState: AppState = {
  bestDigit: 0,
  sessions: [],
  dailyGoal: 50,
  todayDigitsLearned: 0,
  todayDate: new Date().toISOString().slice(0, 10),
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
    return state;
  } catch {
    return { ...defaultState };
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
