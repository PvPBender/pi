import { useState, useCallback, useRef, useEffect } from "react";
import Numpad from "@/components/Numpad";
import DigitStream from "@/components/DigitStream";
import StatsBar from "@/components/StatsBar";
import ChunkLearn from "@/components/ChunkLearn";
import SpacedRepetition from "@/components/SpacedRepetition";
import Dashboard from "@/components/Dashboard";
import Settings from "@/components/Settings";
import MatrixChallenge from "@/components/MatrixChallenge";
import SpeedDrill from "@/components/SpeedDrill";
import Marathon from "@/components/Marathon";
import WeakSpots from "@/components/WeakSpots";
import { getPiDigit, TOTAL_AVAILABLE_DIGITS, ensureDigitsLoaded, isLoaded } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { vibrateLight, vibrateError, vibrateSuccess } from "@/lib/haptics";
import {
  loadState,
  saveState,
  updateStreak,
  updateDailyRecord,
  getChunkArray,
  type AppState,
  type SessionRecord,
} from "@/lib/storage";

type AppMode =
  | "menu"
  | "practice"
  | "learn"
  | "review"
  | "dashboard"
  | "settings"
  | "matrix"
  | "speed"
  | "marathon"
  | "weakspots"
  | "loading";

const PI_RECORDS = [
  { label: "Guinness World Record", holder: "Rajveer Meena 🇮🇳", digits: 70000, year: 2015 },
  { label: "Unofficial #1", holder: "Suresh Kumar Sharma 🇮🇳", digits: 70030, year: 2015, note: "Not in Guinness" },
  { label: "Unofficial claimed", holder: "Akira Haraguchi 🇯🇵", digits: 100000, year: 2006, note: "Not accepted by Guinness" },
  { label: "European Record", holder: "Jonas von Essen 🇸🇪", digits: 24063, year: 2020 },
  { label: "North American Record", holder: "Paul Hearding 🇺🇸", digits: 30448, year: 2025 },
];

function exportData(state: AppState) {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pi-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(onSuccess: (state: AppState) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (typeof data.bestDigit !== "number") {
          alert("Invalid backup file: missing required fields.");
          return;
        }
        // Ensure new format compatibility
        if (Array.isArray(data.chunks)) {
          // Old format — will be migrated by loadState
        }
        saveState(data as AppState);
        onSuccess(loadState()); // Re-load to trigger migration
      } catch {
        alert("Failed to parse backup file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

export default function Index() {
  const [state, setState] = useState<AppState>(loadState);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [errors, setErrors] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>("loading");
  const [latencies, setLatencies] = useState<number[]>([]);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [recordsExpanded, setRecordsExpanded] = useState(false);
  const [practiceElapsed, setPracticeElapsed] = useState(0);
  const [practiceDigits, setPracticeDigits] = useState(0);
  const settings = state.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";
  const lastTapTime = useRef<number>(0);
  const sessionStart = useRef<number>(0);
  const highestReached = useRef(0);
  const practiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;

  const WARMUP_DIGITS = 10;

  useEffect(() => {
    ensureDigitsLoaded().then(() => setMode("menu"));
  }, []);

  const startPractice = useCallback((fromBest = false) => {
    if (!isLoaded()) return;
    const startIdx = fromBest ? Math.max(0, state.bestDigit - WARMUP_DIGITS) : 0;
    setMode("practice");
    setCurrentIndex(startIdx);
    setStreak(0);
    setErrors(0);
    setLatencies([]);
    setLastResult(null);
    setLastDigit(null);
    setPracticeElapsed(0);
    setPracticeDigits(0);
    lastTapTime.current = performance.now();
    sessionStart.current = performance.now();
    highestReached.current = startIdx;

    // Start practice timer
    practiceTimerRef.current = setInterval(() => {
      setPracticeElapsed(performance.now() - sessionStart.current);
    }, 1000);
  }, [state.bestDigit]);

  const endSession = useCallback(() => {
    if (practiceTimerRef.current) {
      clearInterval(practiceTimerRef.current);
      practiceTimerRef.current = null;
    }

    const duration = performance.now() - sessionStart.current;
    const session: SessionRecord = {
      date: new Date().toISOString(),
      digitsReached: highestReached.current,
      avgLatencyMs: avgLatency || 0,
      errors,
      durationMs: duration,
    };

    setState((prev) => {
      const newBest = Math.max(prev.bestDigit, highestReached.current);
      const newLearned = Math.max(0, highestReached.current - prev.bestDigit);
      let next: AppState = {
        ...prev,
        bestDigit: newBest,
        sessions: [...prev.sessions.slice(-199), session],
        todayDigitsLearned: prev.todayDigitsLearned + newLearned,
      };
      next = updateStreak(next);
      next = updateDailyRecord(next, {
        digitsLearned: newLearned,
        totalPracticeMs: duration,
        errorsTotal: errors,
        bestDigitReached: highestReached.current,
        avgLatencyMs: avgLatency || 0,
      });
      saveState(next);
      return next;
    });
    setMode("menu");
  }, [avgLatency, errors]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (mode !== "practice") return;

      const now = performance.now();
      const latency = now - lastTapTime.current;
      lastTapTime.current = now;

      const expected = getPiDigit(currentIndex);

      if (digit === expected) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);
        setStreak((s) => s + 1);
        setPracticeDigits((d) => d + 1);
        if (latency < 5000) setLatencies((l) => [...l, latency]);
        const nextIndex = currentIndex + 1;
        highestReached.current = Math.max(highestReached.current, nextIndex);
        setCurrentIndex(nextIndex);

        if (nextIndex % 50 === 0) {
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();
        }

        if (nextIndex >= TOTAL_AVAILABLE_DIGITS) {
          endSession();
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);
        setStreak(0);
        setErrors((e) => e + 1);
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [mode, currentIndex, endSession, settings]
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode === "practice" && /^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (mode === "menu" && e.key === "Enter") {
        startPractice(true);
      } else if (mode === "practice" && e.key === "Escape") {
        endSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, handleDigit, startPractice, endSession]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (practiceTimerRef.current) clearInterval(practiceTimerRef.current);
    };
  }, []);

  const returnToMenu = useCallback(() => {
    setState(loadState());
    setMode("menu");
  }, []);

  // Loading screen
  if (mode === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-sm text-muted-foreground mt-4 animate-pulse">
          Loading 999,999 digits…
        </p>
      </div>
    );
  }

  // Delegate modes
  if (mode === "learn") return <ChunkLearn onBack={returnToMenu} />;
  if (mode === "review") return <SpacedRepetition onBack={returnToMenu} />;
  if (mode === "dashboard") return <Dashboard onBack={returnToMenu} />;
  if (mode === "settings") return <Settings onBack={returnToMenu} />;
  if (mode === "matrix") return <MatrixChallenge onBack={returnToMenu} />;
  if (mode === "speed") return <SpeedDrill onBack={returnToMenu} />;
  if (mode === "marathon") return <Marathon onBack={returnToMenu} />;
  if (mode === "weakspots") return <WeakSpots onBack={returnToMenu} />;

  // Menu
  if (mode === "menu") {
    const chunkArr = getChunkArray(state);
    const dueCount = chunkArr.filter(
      (c) => c.chunkIndex < state.learnedChunkCount && (c.nextReview <= Date.now() || c.totalReviews === 0)
    ).length;
    // Also count learned chunks that have no ChunkState entry yet
    const trackedChunks = new Set(chunkArr.map((c) => c.chunkIndex));
    let unlearnedDue = 0;
    for (let i = 0; i < state.learnedChunkCount; i++) {
      if (!trackedChunks.has(i)) unlearnedDue++;
    }
    const totalDue = dueCount + unlearnedDue;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        {/* Settings gear - top right */}
        <div className="w-full max-w-xs flex justify-end mb-2">
          <button
            onClick={() => setMode("settings")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        <header className="text-center space-y-1 mb-6">
          <h1 className="text-4xl font-bold tracking-tight text-gradient-amber">π</h1>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">
            pi memorization trainer
          </p>
        </header>

        <div className="text-center space-y-6 w-full max-w-xs">
          {/* Best digit display */}
          <div className="space-y-1">
            <div className="text-5xl font-bold text-gradient-amber">
              {state.bestDigit}
            </div>
            <div className="text-xs text-muted-foreground tracking-widest uppercase">
              digits memorized
            </div>
            {state.currentDayStreak > 0 && (
              <div className="text-xs text-primary">
                🔥 {state.currentDayStreak} day streak
              </div>
            )}
          </div>

          {/* TRAIN section */}
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
              Train
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => startPractice(false)}
                className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity"
              >
                FROM 0
              </button>
              <button
                onClick={() => startPractice(true)}
                className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity"
              >
                CONTINUE
              </button>
            </div>

            <button
              onClick={() => setMode("learn")}
              className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity border border-border"
            >
              📚 LEARN CHUNKS
              <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                {state.learnedChunkCount > 0 ? `${state.learnedChunkCount} learned` : "learn new digit blocks"}
              </span>
            </button>

            <button
              onClick={() => setMode("review")}
              className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity border border-border"
            >
              🔄 REVIEW
              {totalDue > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                  {totalDue}
                </span>
              )}
              <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                {totalDue > 0 ? `${totalDue} due` : "all caught up"}
              </span>
            </button>
          </div>

          {/* CHALLENGE section */}
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
              Challenge
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setMode("matrix")}
                className="px-2 py-3 bg-muted text-foreground rounded-lg font-semibold text-xs tracking-wide hover:opacity-90 transition-opacity border border-border"
              >
                ⚔️
                <span className="block text-[9px] font-normal text-muted-foreground mt-0.5">
                  MATRIX
                </span>
              </button>
              <button
                onClick={() => setMode("speed")}
                className="px-2 py-3 bg-muted text-foreground rounded-lg font-semibold text-xs tracking-wide hover:opacity-90 transition-opacity border border-border"
              >
                ⚡
                <span className="block text-[9px] font-normal text-muted-foreground mt-0.5">
                  SPEED
                </span>
              </button>
              <button
                onClick={() => setMode("marathon")}
                className="px-2 py-3 bg-muted text-foreground rounded-lg font-semibold text-xs tracking-wide hover:opacity-90 transition-opacity border border-border"
              >
                🏔️
                <span className="block text-[9px] font-normal text-muted-foreground mt-0.5">
                  MARATHON
                </span>
              </button>
            </div>
          </div>

          {/* INSIGHTS section */}
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
              Insights
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setMode("dashboard")}
                className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity border border-border"
              >
                📊 DASHBOARD
              </button>
              <button
                onClick={() => setMode("weakspots")}
                className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity border border-border"
              >
                🎯 WEAK SPOTS
              </button>
            </div>
          </div>

          {/* Records section */}
          <div className="w-full">
            <button
              onClick={() => setRecordsExpanded(!recordsExpanded)}
              className="w-full text-left text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              🏆 Records {recordsExpanded ? "▾" : "▸"}
            </button>
            {recordsExpanded && (
              <div className="space-y-2 mt-1">
                {PI_RECORDS.map((rec) => {
                  const progress = Math.min(1, state.bestDigit / rec.digits);
                  const pct = (progress * 100).toFixed(1);
                  return (
                    <div key={rec.label} className="text-left">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>
                          {rec.label} — {rec.holder}
                          {rec.note ? ` (${rec.note})` : ""}
                        </span>
                        <span>{rec.digits.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-muted-foreground/50 mt-0.5">
                        {state.bestDigit.toLocaleString()} / {rec.digits.toLocaleString()} ({pct}%)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick hints */}
          {state.sessions.length > 0 && (
            <div className="text-[10px] text-muted-foreground/50 space-y-0.5">
              <div>enter · continue practice &nbsp;&nbsp; esc · stop</div>
            </div>
          )}

          {/* Export / Import */}
          <div className="flex justify-center gap-4 text-[10px] text-muted-foreground/40">
            <button
              onClick={() => exportData(state)}
              className="hover:text-muted-foreground transition-colors underline"
            >
              Export data
            </button>
            <button
              onClick={() => importData((imported) => setState(imported))}
              className="hover:text-muted-foreground transition-colors underline"
            >
              Import data
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Practice mode
  const dpm = practiceElapsed > 0 ? (practiceDigits / (practiceElapsed / 60000)).toFixed(1) : "0.0";
  const practiceTimeStr = formatPracticeTime(practiceElapsed);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      {/* Header */}
      <header className="text-center space-y-1 w-full">
        <div className="flex justify-between items-center px-2">
          <div className="text-xs text-muted-foreground">{dpm} d/min</div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-xs font-mono text-muted-foreground">{practiceTimeStr}</div>
        </div>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          practice · reciting
        </p>
      </header>

      {/* Digit display */}
      <div className="flex-1 flex items-center w-full">
        <DigitStream currentIndex={currentIndex} showUpcoming={showUpcoming} />
      </div>

      {/* Stats */}
      <div className="w-full mb-4 fade-in">
        <StatsBar
          bestDigit={state.bestDigit}
          currentStreak={streak}
          avgLatency={avgLatency}
          errors={errors}
          todayLearned={state.todayDigitsLearned}
          dailyGoal={settings.dailyGoal}
        />
      </div>

      {/* Numpad */}
      <div className="w-full space-y-3">
        <div className="flex justify-center gap-4 mb-1">
          <button
            onClick={() => setShowUpcoming((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border rounded"
          >
            {showUpcoming ? "hide" : "unhide"} digits
          </button>
        </div>
        <Numpad
          onDigit={handleDigit}
          lastResult={lastResult}
          lastDigit={lastDigit}
          flipped={isCalculatorLayout}
        />
        <button
          onClick={endSession}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          end session
        </button>
      </div>
    </div>
  );
}

function formatPracticeTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
