import { useState, useMemo } from "react";
import { loadState, getChunkState, getChunkArray, type AppState, type ChunkState } from "@/lib/storage";
import { getPiDigits } from "@/lib/pi";
import ConfusionMatrix from "@/components/ConfusionMatrix";
import ForgettingCurve from "@/components/ForgettingCurve";
import { averageFatigueCurves } from "@/lib/fatigue";
import { rateChunkDifficulty, getDifficultyBgColor } from "@/lib/difficulty";

interface DashboardProps {
  onBack: () => void;
}

type HeatmapMode = "mastery" | "difficulty";

export default function Dashboard({ onBack }: DashboardProps) {
  const [state] = useState<AppState>(loadState);
  const [selectedChunk, setSelectedChunk] = useState<ChunkState | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("mastery");

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = state.dailyHistory.find((r) => r.date === today);

  // Streak calendar — last 90 days
  const calendarDays = useMemo(() => {
    const days: { date: string; intensity: number }[] = [];
    const historyMap = new Map(state.dailyHistory.map((r) => [r.date, r]));

    for (let i = 89; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const record = historyMap.get(dateStr);

      let intensity = 0;
      if (record) {
        const score = record.digitsLearned + record.chunksReviewed * 5;
        if (score > 200) intensity = 4;
        else if (score > 100) intensity = 3;
        else if (score > 50) intensity = 2;
        else if (score > 0) intensity = 1;
      }

      days.push({ date: dateStr, intensity });
    }
    return days;
  }, [state.dailyHistory]);

  // Progress chart
  const progressData = useMemo(() => {
    const sorted = [...state.dailyHistory].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-30).map((r) => ({
      date: r.date,
      digits: r.bestDigitReached,
    }));
  }, [state.dailyHistory]);

  // Speed trend
  const speedData = useMemo(() => {
    return state.sessions.slice(-30).map((s, i) => ({
      index: i,
      latency: Math.round(s.avgLatencyMs),
    }));
  }, [state.sessions]);

  // Projection
  const projection = useMemo(() => {
    const sorted = [...state.dailyHistory].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-14);
    if (recent.length < 2) return null;

    const totalLearned = recent.reduce((s, r) => s + r.digitsLearned, 0);
    const avgPerDay = totalLearned / recent.length;
    if (avgPerDay <= 0) return null;

    const remaining = 100000 - state.bestDigit;
    const daysNeeded = Math.ceil(remaining / avgPerDay);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysNeeded);
    return targetDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [state.dailyHistory, state.bestDigit]);

  // Chunk heatmap with difficulty support
  const chunkHeatmap = useMemo(() => {
    const chunks: { index: number; level: number; difficulty: number }[] = [];
    const maxChunks = Math.min(state.learnedChunkCount + 20, 200);
    const chunkSize = state.settings.chunkSize;

    for (let i = 0; i < maxChunks; i++) {
      const cs = getChunkState(state, i);
      let level = 0;
      if (i < state.learnedChunkCount) {
        if (cs.correctStreak >= 5) level = 4;
        else if (cs.correctStreak >= 3) level = 3;
        else if (cs.totalReviews > 1) level = 2;
        else level = 1;
      }
      const digits = getPiDigits(i * chunkSize, chunkSize);
      const difficulty = rateChunkDifficulty(digits);
      chunks.push({ index: i, level, difficulty });
    }
    return chunks;
  }, [state]);

  if (selectedChunk) {
    return <ForgettingCurve chunk={selectedChunk} onClose={() => setSelectedChunk(null)} />;
  }

  const intensityColors = [
    "bg-muted/20",
    "bg-green-900/50",
    "bg-green-700/60",
    "bg-green-500/70",
    "bg-green-400",
  ];

  const chunkColors = [
    "bg-muted/20",
    "bg-red-500/60",
    "bg-orange-500/60",
    "bg-yellow-500/60",
    "bg-green-500/70",
  ];

  const maxProgress = progressData.length > 0 ? Math.max(...progressData.map((p) => p.digits)) : 1;

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">dashboard</p>
      </header>

      <div className="w-full space-y-6 flex-1 overflow-y-auto pb-4">
        {/* Today's summary */}
        <Section title="Today">
          <div className="grid grid-cols-3 gap-3 text-center">
            <StatCell
              label="learned"
              value={(todayRecord?.digitsLearned ?? state.todayDigitsLearned).toString()}
            />
            <StatCell
              label="reviewed"
              value={(todayRecord?.chunksReviewed ?? 0).toString()}
            />
            <StatCell
              label="time"
              value={formatDuration(todayRecord?.totalPracticeMs ?? 0)}
            />
          </div>
          {state.currentDayStreak > 0 && (
            <div className="text-center mt-2">
              <span className="text-xs text-primary">
                🔥 {state.currentDayStreak} day streak
              </span>
            </div>
          )}
        </Section>

        {/* Streak calendar */}
        <Section title="Activity (90 days)">
          <div className="grid grid-cols-15 gap-[2px]" style={{ gridTemplateColumns: "repeat(15, 1fr)" }}>
            {calendarDays.map((day, i) => (
              <div
                key={i}
                className={`aspect-square rounded-sm ${intensityColors[day.intensity]}`}
                title={`${day.date}: level ${day.intensity}`}
              />
            ))}
          </div>
          <div className="flex justify-end gap-1 mt-1 items-center">
            <span className="text-[9px] text-muted-foreground mr-1">less</span>
            {intensityColors.map((c, i) => (
              <div key={i} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
            ))}
            <span className="text-[9px] text-muted-foreground ml-1">more</span>
          </div>
        </Section>

        {/* Progress chart */}
        {progressData.length > 0 && (
          <Section title="Progress (digits over time)">
            <div className="flex items-end gap-[2px] h-24">
              {progressData.map((p, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary/60 rounded-t-sm transition-all"
                  style={{ height: `${(p.digits / maxProgress) * 100}%` }}
                  title={`${p.date}: ${p.digits} digits`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>{progressData[0]?.date.slice(5)}</span>
              <span>{progressData[progressData.length - 1]?.date.slice(5)}</span>
            </div>
          </Section>
        )}

        {/* Speed trend */}
        {speedData.length > 0 && (
          <Section title="Speed trend (ms/digit, last 30 sessions)">
            <div className="flex items-end gap-[2px] h-20">
              {speedData.map((s, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm transition-all ${
                    s.latency < 400
                      ? "bg-green-500/60"
                      : s.latency < 800
                      ? "bg-yellow-500/60"
                      : "bg-red-500/60"
                  }`}
                  style={{ height: `${Math.max(5, (s.latency / Math.max(...speedData.map(x => x.latency), 1)) * 100)}%` }}
                  title={`Session ${i + 1}: ${s.latency}ms`}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Projection */}
        {projection && (
          <Section title="Projection">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                At current rate: <span className="text-primary font-bold">100k</span> by
              </div>
              <div className="text-lg font-bold text-foreground mt-1">{projection}</div>
            </div>
          </Section>
        )}

        {/* Chunk heatmap */}
        {chunkHeatmap.length > 0 && (
          <Section title="Chunk mastery">
            <div className="flex justify-between items-center mb-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setHeatmapMode("mastery")}
                  className={`text-[9px] px-2 py-0.5 rounded ${
                    heatmapMode === "mastery" ? "bg-primary/20 text-primary" : "text-muted-foreground"
                  }`}
                >
                  Mastery
                </button>
                <button
                  onClick={() => setHeatmapMode("difficulty")}
                  className={`text-[9px] px-2 py-0.5 rounded ${
                    heatmapMode === "difficulty" ? "bg-primary/20 text-primary" : "text-muted-foreground"
                  }`}
                >
                  Difficulty
                </button>
              </div>
              <span className="text-[9px] text-muted-foreground/50">tap chunk for details</span>
            </div>
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: "repeat(20, 1fr)" }}
            >
              {chunkHeatmap.map((c) => (
                <div
                  key={c.index}
                  onClick={() => {
                    if (c.index < state.learnedChunkCount) {
                      setSelectedChunk(getChunkState(state, c.index));
                    }
                  }}
                  className={`aspect-square rounded-sm cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all ${
                    heatmapMode === "mastery"
                      ? chunkColors[c.level]
                      : getDifficultyBgColor(c.difficulty)
                  }`}
                  title={`Chunk ${c.index + 1}: ${
                    heatmapMode === "mastery"
                      ? ["unlearned", "learning", "reviewed", "familiar", "mastered"][c.level]
                      : `difficulty ${c.difficulty}/10`
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {heatmapMode === "mastery" ? (
                ["unlearned", "learning", "reviewed", "familiar", "mastered"].map((label, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-sm ${chunkColors[i]}`} />
                    <span className="text-[8px] text-muted-foreground">{label}</span>
                  </div>
                ))
              ) : (
                ["easy", "medium", "hard", "brutal"].map((label, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-sm ${
                      ["bg-green-500/60", "bg-yellow-500/60", "bg-orange-500/60", "bg-red-500/60"][i]
                    }`} />
                    <span className="text-[8px] text-muted-foreground">{label}</span>
                  </div>
                ))
              )}
            </div>
          </Section>
        )}

        {/* Fatigue Curve */}
        {(() => {
          const sessionsWithFatigue = state.sessions
            .filter(s => s.fatigueBuckets && s.fatigueBuckets.length > 0)
            .slice(-5);
          if (sessionsWithFatigue.length === 0) return null;
          const avgCurve = averageFatigueCurves(
            sessionsWithFatigue.map(s => s.fatigueBuckets!)
          );
          if (avgCurve.length === 0) return null;
          const maxLat = Math.max(...avgCurve.map(b => b.avgLatencyMs), 1);
          return (
            <Section title="Fatigue Curve (avg last 5 sessions)">
              <div className="flex items-end gap-[2px] h-20">
                {avgCurve.map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-[1px]">
                    <div
                      className="w-full bg-primary/60 rounded-t-sm"
                      style={{ height: `${Math.max(5, (b.digitsCorrect / 100) * 80)}%` }}
                      title={`${b.minutesMark}min: ${b.digitsCorrect}% accuracy`}
                    />
                    <div
                      className="w-full bg-red-500/40 rounded-t-sm"
                      style={{ height: `${Math.max(2, (b.avgLatencyMs / maxLat) * 50)}%` }}
                      title={`${b.minutesMark}min: ${Math.round(b.avgLatencyMs)}ms latency`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>{avgCurve[0]?.minutesMark}min</span>
                <span>{avgCurve[avgCurve.length - 1]?.minutesMark}min</span>
              </div>
              <div className="flex justify-center gap-3 text-[9px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-primary/60 rounded-sm inline-block" /> accuracy</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500/40 rounded-sm inline-block" /> latency</span>
              </div>
            </Section>
          );
        })()}

        {/* Confusion Matrix */}
        <Section title="Confusion Matrix">
          <ConfusionMatrix state={state} />
        </Section>

        {/* Session history */}
        <Section title={`Sessions (${state.sessions.length})`}>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {state.sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center">No sessions yet.</p>
            ) : (
              [...state.sessions]
                .reverse()
                .slice(0, 20)
                .map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-xs px-2 py-1 bg-muted/30 rounded"
                  >
                    <span className="text-muted-foreground">
                      {new Date(s.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>
                      <span className="text-primary font-bold">{s.digitsReached}</span>
                      <span className="text-muted-foreground"> · {Math.round(s.avgLatencyMs)}ms</span>
                      {s.errors > 0 && (
                        <span className="text-destructive"> · {s.errors}err</span>
                      )}
                    </span>
                  </div>
                ))
            )}
          </div>
        </Section>
      </div>

      <button
        onClick={onBack}
        className="mt-4 px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
      >
        BACK
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms === 0) return "0m";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}
