import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import DigitStream from "@/components/DigitStream";
import { getPiDigit, TOTAL_AVAILABLE_DIGITS } from "@/lib/pi";
import { playTone, playErrorTone } from "@/lib/audio";
import { vibrateLight, vibrateError } from "@/lib/haptics";
import { loadState, saveState, updateStreak, updateDailyRecord, recordConfusion, type AppState, type SessionRecord } from "@/lib/storage";
import { addXP } from "@/lib/xp";
import { applyAchievementCheck } from "@/lib/achievements";
import { FatigueTracker } from "@/lib/fatigue";

interface MarathonProps {
  onBack: () => void;
}

const BREAK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export default function Marathon({ onBack }: MarathonProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalDigits, setTotalDigits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showBreak, setShowBreak] = useState(false);
  const [done, setDone] = useState(false);
  const [flashError, setFlashError] = useState(false);
  const startTime = useRef(performance.now());
  const lastBreakTime = useRef(performance.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fatigueTracker = useRef(new FatigueTracker());
  const lastDigitTime = useRef(performance.now());
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";

  // Start timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      const now = performance.now();
      setElapsed(now - startTime.current);

      // Check for break suggestion
      if (now - lastBreakTime.current > BREAK_INTERVAL_MS) {
        setShowBreak(true);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const digitsPerMinute = elapsed > 0 ? (totalDigits / (elapsed / 60000)).toFixed(1) : "0.0";

  const formatTime = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const endMarathon = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const session: SessionRecord = {
      date: new Date().toISOString(),
      digitsReached: currentIndex,
      avgLatencyMs: totalDigits > 0 ? elapsed / totalDigits : 0,
      errors,
      durationMs: elapsed,
      fatigueBuckets: fatigueTracker.current.export(),
    };

    setAppState((prev) => {
      let next = {
        ...prev,
        bestDigit: Math.max(prev.bestDigit, currentIndex),
        sessions: [...prev.sessions.slice(-199), session],
      };
      next = updateStreak(next);
      next = updateDailyRecord(next, {
        totalPracticeMs: elapsed,
        errorsTotal: errors,
        bestDigitReached: currentIndex,
      });
      // XP: 1 per correct digit
      const correctDigits = totalDigits - errors;
      if (correctDigits > 0) {
        const [withXP] = addXP(next, correctDigits, settings.soundEnabled, settings.hapticsEnabled);
        next = withXP;
      }
      const [withAch] = applyAchievementCheck(next);
      next = withAch;
      saveState(next);
      return next;
    });

    setDone(true);
  }, [currentIndex, totalDigits, elapsed, errors]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (done) return;

      const expected = getPiDigit(currentIndex);

      const now = performance.now();
      const latency = now - lastDigitTime.current;
      lastDigitTime.current = now;

      if (digit === expected) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);
        setCurrentIndex((i) => i + 1);
        setTotalDigits((t) => t + 1);
        fatigueTracker.current.record(true, latency);
      } else {
        // Marathon mode: flash red but keep going
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);
        setErrors((e) => e + 1);
        setFlashError(true);
        setTimeout(() => setFlashError(false), 300);
        fatigueTracker.current.record(false, latency);
        // Record confusion
        setAppState(prev => {
          const next = recordConfusion(prev, expected, digit);
          saveState(next);
          return next;
        });
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [done, currentIndex, settings]
  );

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Escape") endMarathon();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, endMarathon]);

  if (done) {
    const errorRate = totalDigits > 0 ? ((errors / totalDigits) * 100).toFixed(2) : "0";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🏔️</div>
          <p className="text-lg font-bold text-foreground">Marathon Complete</p>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-2xl font-bold text-primary">{totalDigits}</div>
              <div className="text-[10px] text-muted-foreground uppercase">total digits</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{formatTime(elapsed)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">duration</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{digitsPerMinute}</div>
              <div className="text-[10px] text-muted-foreground uppercase">d/min</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{errorRate}%</div>
              <div className="text-[10px] text-muted-foreground uppercase">error rate</div>
            </div>
          </div>

          <button
            onClick={onBack}
            className="px-5 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm mt-4"
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    );
  }

  // Break overlay
  if (showBreak) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <div className="text-4xl">☕</div>
          <p className="text-lg font-bold text-foreground">30 min reached — take a break?</p>
          <p className="text-sm text-muted-foreground">
            {totalDigits} digits · {digitsPerMinute} d/min · {errors} errors
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowBreak(false);
                lastBreakTime.current = performance.now();
              }}
              className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
            >
              CONTINUE
            </button>
            <button
              onClick={endMarathon}
              className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
            >
              END
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto transition-colors duration-200 ${flashError ? "bg-red-900/20" : ""}`}>
      {/* Header with clock */}
      <header className="text-center space-y-1 w-full">
        <div className="flex justify-between items-center px-2">
          <div className="text-xs text-muted-foreground">{digitsPerMinute} d/min</div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-xs font-mono text-muted-foreground">{formatTime(elapsed)}</div>
        </div>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          marathon · {totalDigits} digits
        </p>
      </header>

      {/* Digit display */}
      <div className="flex-1 flex items-center w-full">
        <DigitStream currentIndex={currentIndex} showUpcoming={false} />
      </div>

      {/* Stats */}
      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell label="digits" value={totalDigits.toString()} />
          <StatCell label="errors" value={errors.toString()} />
          <StatCell label="d/min" value={digitsPerMinute} />
        </div>
      </div>

      {/* Numpad */}
      <div className="w-full space-y-3">
        <Numpad
          onDigit={handleDigit}
          lastResult={lastResult}
          lastDigit={lastDigit}
          flipped={isCalculatorLayout}
        />
        <button
          onClick={endMarathon}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          end marathon
        </button>
      </div>
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
