import { type FatigueBucket } from "./storage";

const BUCKET_MS = 5 * 60 * 1000; // 5 minutes

export class FatigueTracker {
  private sessionStartMs: number;
  private buckets: Map<number, { attempted: number; correct: number; totalLatencyMs: number }> = new Map();

  constructor() {
    this.sessionStartMs = performance.now();
  }

  record(correct: boolean, latencyMs: number): void {
    const elapsed = performance.now() - this.sessionStartMs;
    const bucketIdx = Math.floor(elapsed / BUCKET_MS);

    let bucket = this.buckets.get(bucketIdx);
    if (!bucket) {
      bucket = { attempted: 0, correct: 0, totalLatencyMs: 0 };
      this.buckets.set(bucketIdx, bucket);
    }

    bucket.attempted++;
    if (correct) bucket.correct++;
    bucket.totalLatencyMs += latencyMs;
  }

  export(): FatigueBucket[] {
    const result: FatigueBucket[] = [];
    for (const [idx, b] of this.buckets) {
      result.push({
        minutesMark: idx * 5,
        digitsAttempted: b.attempted,
        digitsCorrect: b.correct,
        avgLatencyMs: b.attempted > 0 ? b.totalLatencyMs / b.attempted : 0,
      });
    }
    return result.sort((a, b) => a.minutesMark - b.minutesMark);
  }
}

// Average fatigue buckets across multiple sessions
export function averageFatigueCurves(sessions: FatigueBucket[][]): FatigueBucket[] {
  if (sessions.length === 0) return [];

  const bucketMap = new Map<number, { totalAccuracy: number; totalLatency: number; count: number }>();

  for (const session of sessions) {
    for (const bucket of session) {
      let entry = bucketMap.get(bucket.minutesMark);
      if (!entry) {
        entry = { totalAccuracy: 0, totalLatency: 0, count: 0 };
        bucketMap.set(bucket.minutesMark, entry);
      }
      const accuracy = bucket.digitsAttempted > 0 ? bucket.digitsCorrect / bucket.digitsAttempted : 0;
      entry.totalAccuracy += accuracy;
      entry.totalLatency += bucket.avgLatencyMs;
      entry.count++;
    }
  }

  const result: FatigueBucket[] = [];
  for (const [mark, entry] of bucketMap) {
    result.push({
      minutesMark: mark,
      digitsAttempted: entry.count,
      digitsCorrect: Math.round((entry.totalAccuracy / entry.count) * 100), // store as percentage
      avgLatencyMs: entry.totalLatency / entry.count,
    });
  }

  return result.sort((a, b) => a.minutesMark - b.minutesMark);
}
