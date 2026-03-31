// Chunk Difficulty Rating System
// Pre-rate chunks by inherent difficulty (1-10)

export function rateChunkDifficulty(digits: string): number {
  let score = 0;

  // Repeated digits are easier: "11111" is trivial
  const unique = new Set(digits.split("")).size;
  score += (unique - 1) * 2; // more unique = harder

  // Sequential runs are easier: "12345"
  let sequential = 0;
  for (let i = 1; i < digits.length; i++) {
    if (Math.abs(parseInt(digits[i]) - parseInt(digits[i - 1])) === 1) sequential++;
  }
  score -= sequential; // more sequential = easier

  // Repeated pairs/patterns
  if (/(.)\1/.test(digits)) score -= 1; // has repeated digits
  if (/(\d{2}).*\1/.test(digits)) score -= 2; // has repeated pairs

  // All same digit
  if (unique === 1) score -= 5;

  // Normalize to 1-10
  return Math.max(1, Math.min(10, score + 5));
}

// Color for difficulty rating
export function getDifficultyColor(rating: number): string {
  if (rating <= 3) return "text-green-400";
  if (rating <= 5) return "text-yellow-400";
  if (rating <= 7) return "text-orange-400";
  return "text-red-400";
}

export function getDifficultyBgColor(rating: number): string {
  if (rating <= 3) return "bg-green-500/60";
  if (rating <= 5) return "bg-yellow-500/60";
  if (rating <= 7) return "bg-orange-500/60";
  return "bg-red-500/60";
}

export function getDifficultyLabel(rating: number): string {
  if (rating <= 2) return "trivial";
  if (rating <= 4) return "easy";
  if (rating <= 6) return "medium";
  if (rating <= 8) return "hard";
  return "brutal";
}
