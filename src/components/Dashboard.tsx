import { useState, useMemo } from "react";
import { loadState, getChunkState, getChunkArray, type AppState } from "@/lib/storage";

interface DashboardProps {
  onBack: () => void;
}

export default function Dashboard({ onBack }: DashboardProps) {
  const [state] = useState<AppState>(loadState);

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

  // Progress chart — bestDigit over time from daily history
  const progressData = useMemo(() => {
    const sorted = [...state.dailyHistory].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-30).map((r) => ({
      date: r.date,
      digits: r.bestDigitReached,
    }));
  }, [state.dailyHistory]);

  // Speed trend — avg latency from last 30 sessions
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

  // Chunk heatmap
  const chunkHeatmap = useMemo(() => {
    const chunks: { index: number; level: number }[] = [];
    const maxChunks = Math.min(state.learnedChunkCount + 20, 200); // Show up to 200

    for (let i = 0; i < maxChunks; i++) {
      const cs = getChunkState(state, i);
      let level = 0; // unlearned
      if (i < state.learnedChunkCount) {
        if (cs.correctStreak >= 5) level = 4; // mastered
        else if (cs.correctStreak >= 3) level = 3; // familiar
        else if (cs.totalReviews > 1) level = 2; // reviewed
        else level = 1; // learning
      }
      chunks.push({ index: i, level });
    }
    return chunks;
  }, [state]);

  const intensityColors = [
    "bg-muted/20",       // 0: no activity
    "bg-green-900/50",   // 1: light
    "bg-green-700/60",   // 2: moderate
    "bg-green-500/70",   // 3: active
    "bg-green-400",      // 4: intense
  ];

  const chunkColors = [
    "bg-muted/20",       // 0: unlearned
    "bg-red-500/60",     // 1: learning
    "bg-orange-500/60",  // 2: reviewed
    "bg-yellow-500/60",  // 3: familiar
    "bg-green-500/70",   // 4: mastered
  ];

  const maxProgress = progressData.length > 0 ? Math.max(...progressData.map((p) => p.digits)) : 1;
  const maxLatency = speedData.length > 0 ? Math.max(...speedData.map((s) => s.latency)) : 1;

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
                  style={{ height: `${Math.max(5, (s.latency / maxLatency) * 100)}%` }}
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
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: "repeat(20, 1fr)" }}
            >
              {chunkHeatmap.map((c) => (
                <div
                  key={c.index}
                  className={`aspect-square rounded-sm ${chunkColors[c.level]}`}
                  title={`Chunk ${c.index + 1}: ${
                    ["unlearned", "learning", "reviewed", "familiar", "mastered"][c.level]
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {["unlearned", "learning", "reviewed", "familiar", "mastered"].map((label, i) => (
                <div key={label} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded-sm ${chunkColors[i]}`} />
                  <span className="text-[8px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Session history (compact) */}
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
