import { useState, useCallback, useRef, useEffect } from "react";
import Numpad from "@/components/Numpad";
import DigitStream from "@/components/DigitStream";
import StatsBar from "@/components/StatsBar";
import { getPiDigit, TOTAL_AVAILABLE_DIGITS } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { loadState, saveState, type AppState, type SessionRecord } from "@/lib/storage";

type Mode = "practice" | "idle";

export default function Index() {
  const [state, setState] = useState<AppState>(loadState);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [errors, setErrors] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [latencies, setLatencies] = useState<number[]>([]);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [flippedNumpad, setFlippedNumpad] = useState(false);
  const lastTapTime = useRef<number>(0);
  const sessionStart = useRef<number>(0);
  const highestReached = useRef(0);

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;

  const WARMUP_DIGITS = 10;

  const startPractice = useCallback((fromBest = false) => {
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
    setMode("idle");
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
      } else if (mode === "idle" && e.key === "Enter") {
        startPractice();
      } else if (mode === "practice" && e.key === "Escape") {
        endSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, handleDigit, startPractice, endSession]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          {mode === "idle" ? "ready" : "reciting"}
        </p>
      </header>

      {/* Digit display */}
      <div className="flex-1 flex items-center">
        {mode === "practice" ? (
          <DigitStream currentIndex={currentIndex} showUpcoming={showUpcoming} />
        ) : (
          <div className="text-center space-y-4 fade-in">
            <div className="text-6xl font-bold text-gradient-amber">
              {state.bestDigit}
            </div>
            <div className="text-xs text-muted-foreground tracking-widest uppercase">
              digits memorized
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => startPractice(false)}
                className="px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity"
              >
                FROM 0
              </button>
              <button
                onClick={() => startPractice(true)}
                className="px-5 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity"
              >
                CONTINUE
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              continue starts {WARMUP_DIGITS} digits before your best
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              enter · continue &nbsp;&nbsp; esc · stop
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {mode === "practice" && (
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
      )}

      {/* Numpad */}
      <div className="w-full">
        {mode === "practice" ? (
          <div className="space-y-3">
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
        ) : (
          <div className="text-center text-muted-foreground/30 text-xs">
            {state.sessions.length > 0 && (
              <span>
                {state.sessions.length} session{state.sessions.length !== 1 ? "s" : ""} recorded
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
