import { type AppState, saveState } from "./storage";
import { playSuccessTone } from "./audio";
import { vibrateSuccess } from "./haptics";

export interface LevelInfo {
  level: number;
  name: string;
  xpRequired: number;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: "Novice", xpRequired: 0 },
  { level: 2, name: "Beginner", xpRequired: 100 },
  { level: 3, name: "Student", xpRequired: 500 },
  { level: 4, name: "Practitioner", xpRequired: 2000 },
  { level: 5, name: "Adept", xpRequired: 5000 },
  { level: 6, name: "Expert", xpRequired: 15000 },
  { level: 7, name: "Master", xpRequired: 50000 },
  { level: 8, name: "Grandmaster", xpRequired: 150000 },
  { level: 9, name: "Legend", xpRequired: 500000 },
  { level: 10, name: "Transcendent", xpRequired: 1000000 },
];

export function getLevelForXP(xp: number): LevelInfo {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) return LEVELS[i];
  }
  return LEVELS[0];
}

export function getNextLevel(currentLevel: number): LevelInfo | null {
  const idx = LEVELS.findIndex((l) => l.level === currentLevel);
  if (idx < 0 || idx >= LEVELS.length - 1) return null;
  return LEVELS[idx + 1];
}

export function getXPProgress(xp: number): { current: number; next: number; progress: number } {
  const level = getLevelForXP(xp);
  const next = getNextLevel(level.level);
  if (!next) return { current: xp, next: xp, progress: 1 };
  const currentBase = level.xpRequired;
  const nextReq = next.xpRequired;
  const progress = (xp - currentBase) / (nextReq - currentBase);
  return { current: xp - currentBase, next: nextReq - currentBase, progress: Math.min(1, progress) };
}

// Add XP and check for level-ups. Returns [newState, didLevelUp]
export function addXP(state: AppState, amount: number, soundEnabled: boolean, hapticsEnabled: boolean): [AppState, boolean] {
  const newXP = state.xp + amount;
  const newLevel = getLevelForXP(newXP);
  const didLevelUp = newLevel.level > state.level;

  if (didLevelUp) {
    if (soundEnabled) playSuccessTone();
    if (hapticsEnabled) vibrateSuccess();
  }

  return [{ ...state, xp: newXP, level: newLevel.level }, didLevelUp];
}
