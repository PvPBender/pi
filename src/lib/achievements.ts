import { type AppState } from "./storage";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (state: AppState) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Digit milestones
  { id: "digits_100", name: "First Steps", desc: "Memorize 100 digits", icon: "🐣", check: (s) => s.bestDigit >= 100 },
  { id: "digits_500", name: "Getting Serious", desc: "Memorize 500 digits", icon: "📖", check: (s) => s.bestDigit >= 500 },
  { id: "digits_1000", name: "Four Digits Club", desc: "Memorize 1,000 digits", icon: "🎯", check: (s) => s.bestDigit >= 1000 },
  { id: "digits_5000", name: "Dedication", desc: "Memorize 5,000 digits", icon: "💪", check: (s) => s.bestDigit >= 5000 },
  { id: "digits_10000", name: "Pi Matrix Ready", desc: "Memorize 10,000 digits", icon: "⚔️", check: (s) => s.bestDigit >= 10000 },
  { id: "digits_25000", name: "European Contender", desc: "Memorize 25,000 digits", icon: "🇪🇺", check: (s) => s.bestDigit >= 25000 },
  { id: "digits_50000", name: "World Class", desc: "Memorize 50,000 digits", icon: "🌍", check: (s) => s.bestDigit >= 50000 },
  { id: "digits_70000", name: "Guinness Territory", desc: "Memorize 70,000 digits", icon: "🏆", check: (s) => s.bestDigit >= 70000 },
  { id: "digits_100000", name: "The Haraguchi", desc: "Memorize 100,000 digits", icon: "👑", check: (s) => s.bestDigit >= 100000 },

  // Streak milestones
  { id: "streak_7", name: "Week Warrior", desc: "7-day practice streak", icon: "🔥", check: (s) => s.currentDayStreak >= 7 },
  { id: "streak_30", name: "Monthly Master", desc: "30-day practice streak", icon: "📅", check: (s) => s.currentDayStreak >= 30 },
  { id: "streak_100", name: "Centurion", desc: "100-day practice streak", icon: "💯", check: (s) => s.currentDayStreak >= 100 },
  { id: "streak_365", name: "Year of Pi", desc: "365-day practice streak", icon: "🗓️", check: (s) => s.currentDayStreak >= 365 },

  // Speed achievements (checked via session data)
  { id: "speed_sub500", name: "Quick Fingers", desc: "Average <500ms per digit in a session", icon: "⚡", check: (s) => s.sessions.some((sess) => sess.avgLatencyMs > 0 && sess.avgLatencyMs < 500 && sess.digitsReached > 50) },
  { id: "speed_sub300", name: "Lightning", desc: "Average <300ms per digit in a session", icon: "⚡⚡", check: (s) => s.sessions.some((sess) => sess.avgLatencyMs > 0 && sess.avgLatencyMs < 300 && sess.digitsReached > 50) },
  { id: "speed_sub200", name: "Superhuman", desc: "Average <200ms per digit in a session", icon: "🦸", check: (s) => s.sessions.some((sess) => sess.avgLatencyMs > 0 && sess.avgLatencyMs < 200 && sess.digitsReached > 50) },

  // Marathon achievements
  { id: "marathon_1h", name: "Endurance", desc: "1-hour marathon session", icon: "🏃", check: (s) => s.sessions.some((sess) => sess.durationMs >= 3600000) },
  { id: "marathon_3h", name: "Iron Will", desc: "3-hour marathon session", icon: "🏔️", check: (s) => s.sessions.some((sess) => sess.durationMs >= 10800000) },
  { id: "marathon_8h", name: "Ultramarathon", desc: "8-hour marathon session", icon: "🦾", check: (s) => s.sessions.some((sess) => sess.durationMs >= 28800000) },

  // Review achievements
  { id: "review_perfect", name: "Perfect Review", desc: "Review session with 0 errors", icon: "✨", check: () => false }, // checked manually
  { id: "chunks_mastered_100", name: "Century of Chunks", desc: "Master 100 chunks", icon: "📚", check: (s) => {
    let count = 0;
    for (const k of Object.keys(s.chunks)) {
      if (s.chunks[Number(k)].correctStreak >= 5) count++;
    }
    return count >= 100;
  }},
  { id: "chunks_mastered_1000", name: "Thousand Chunks", desc: "Master 1,000 chunks", icon: "🏛️", check: (s) => {
    let count = 0;
    for (const k of Object.keys(s.chunks)) {
      if (s.chunks[Number(k)].correctStreak >= 5) count++;
    }
    return count >= 1000;
  }},

  // Special
  { id: "matrix_perfect", name: "Matrix Master", desc: "Perfect score in Matrix Challenge", icon: "🧠", check: () => false }, // checked manually
  { id: "night_owl", name: "Night Owl", desc: "Practice after midnight", icon: "🦉", check: () => { const h = new Date().getHours(); return h >= 0 && h < 5; } },
  { id: "early_bird", name: "Early Bird", desc: "Practice before 6 AM", icon: "🌅", check: () => { const h = new Date().getHours(); return h >= 4 && h < 6; } },
];

// Check all achievements and return newly unlocked ones
export function checkAchievements(state: AppState): string[] {
  const newlyUnlocked: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (state.achievements.includes(ach.id)) continue;
    if (ach.check(state)) {
      newlyUnlocked.push(ach.id);
    }
  }
  return newlyUnlocked;
}

// Manually unlock an achievement
export function unlockAchievement(state: AppState, id: string): AppState {
  if (state.achievements.includes(id)) return state;
  return { ...state, achievements: [...state.achievements, id] };
}

// Run achievement check and apply
export function applyAchievementCheck(state: AppState): [AppState, string[]] {
  const newlyUnlocked = checkAchievements(state);
  if (newlyUnlocked.length === 0) return [state, []];
  return [{ ...state, achievements: [...state.achievements, ...newlyUnlocked] }, newlyUnlocked];
}
