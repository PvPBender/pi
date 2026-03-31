import { useState, useCallback, useRef, useEffect } from "react";
import Numpad from "@/components/Numpad";
import DigitStream from "@/components/DigitStream";
import StatsBar from "@/components/StatsBar";
import ChunkLearn from "@/components/ChunkLearn";
import SpacedRepetition from "@/components/SpacedRepetition";
import { getPiDigit, TOTAL_AVAILABLE_DIGITS, ensureDigitsLoaded, isLoaded } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { loadState, saveState, type AppState, type SessionRecord } from "@/lib/storage";

type AppMode = "menu" | "practice" | "learn" | "review" | "loading";

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
  const [flippedNumpad, setFlippedNumpad] = useState(false);
  const lastTapTime = useRef<number>(0);
  const sessionStart = useRef<number>(0);
  const highestReached = useRef(0);

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;

  const WARMUP_DIGITS = 10;

  // Load pi digits on mount
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
    lastTapTime.current = performance.now();
    sessionStart.current = performance.now();
    highestReached.current = startIdx;
  }, [state.bestDigit]);

  const endSession = useCallback(() => {
    const session: SessionRecord = {
      date: new Date().toISOString(),
      digitsReached: highestReached.current,
      avgLatencyMs: avgLatency || 0,
      errors,
      durationMs: performance.now() - sessionStart.current,
    };

    setState((prev) => {
      const newBest = Math.max(prev.bestDigit, highestReached.current);
      const newLearned = Math.max(0, highestReached.current - prev.bestDigit);
      const next: AppState = {
        ...prev,
        bestDigit: newBest,
        sessions: [...prev.sessions.slice(-99), session],
        todayDigitsLearned: prev.todayDigitsLearned + newLearned,
      };
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
        playTone(digit);
        setLastResult("correct");
        setLastDigit(digit);
        setStreak((s) => s + 1);
        if (latency < 5000) setLatencies((l) => [...l, latency]);
        const nextIndex = currentIndex + 1;
        highestReached.current = Math.max(highestReached.current, nextIndex);
        setCurrentIndex(nextIndex);

        // Milestone celebration every 50 digits
        if (nextIndex % 50 === 0) {
          playSuccessTone();
        }

        if (nextIndex >= TOTAL_AVAILABLE_DIGITS) {
          endSession();
        }
      } else {
        playErrorTone();
        setLastResult("error");
        setLastDigit(digit);
        setStreak(0);
        setErrors((e) => e + 1);
      }

      // Clear visual feedback
      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [mode, currentIndex, endSession]
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

  // Learn mode — delegate to ChunkLearn
  if (mode === "learn") {
    return <ChunkLearn onBack={() => { setState(loadState()); setMode("menu"); }} />;
  }

  // Review mode — delegate to SpacedRepetition
  if (mode === "review") {
    return <SpacedRepetition onBack={() => { setState(loadState()); setMode("menu"); }} />;
  }

  // Menu
  if (mode === "menu") {
    const dueCount = state.chunks.filter(
      (c) => c.nextReview <= Date.now() || c.totalReviews === 0
    ).length;
    const unlearnedDue = Math.max(0, state.learnedChunkCount - state.chunks.length);
    const totalDue = dueCount + unlearnedDue;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <header className="text-center space-y-1 mb-8">
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
          </div>

          {/* Mode buttons */}
          <div className="space-y-3">
            {/* Practice */}
            <div className="space-y-2">
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
              <div className="text-[10px] text-muted-foreground">
                sequential practice — type digits of pi in order
              </div>
            </div>

            {/* Learn */}
            <button
              onClick={() => setMode("learn")}
              className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity border border-border"
            >
              LEARN CHUNKS
              <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                learn 5-digit blocks with interleaved review
                {state.learnedChunkCount > 0 && ` · ${state.learnedChunkCount} learned`}
              </span>
            </button>

            {/* Review */}
            <button
              onClick={() => setMode("review")}
              className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity border border-border"
            >
              REVIEW
              {totalDue > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                  {totalDue}
                </span>
              )}
              <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                spaced repetition of learned chunks
                {totalDue > 0 ? ` · ${totalDue} due` : " · all caught up"}
              </span>
            </button>
          </div>

          {/* Quick stats */}
          {state.sessions.length > 0 && (
            <div className="text-[10px] text-muted-foreground/50 space-y-0.5">
              <div>
                {state.sessions.length} session{state.sessions.length !== 1 ? "s" : ""} recorded
              </div>
              <div>enter · continue practice &nbsp;&nbsp; esc · stop</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Practice mode
  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
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
          dailyGoal={state.dailyGoal}
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
          <button
            onClick={() => setFlippedNumpad((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border rounded"
          >
            {flippedNumpad ? "123↑" : "789↑"}
          </button>
        </div>
        <Numpad
          onDigit={handleDigit}
          lastResult={lastResult}
          lastDigit={lastDigit}
          flipped={flippedNumpad}
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
