import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import { getPiDigit, TOTAL_AVAILABLE_DIGITS } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { vibrateLight, vibrateError, vibrateSuccess } from "@/lib/haptics";
import { loadState, saveState, updateStreak, updateDailyRecord, recordConfusion, type AppState, type SessionRecord } from "@/lib/storage";
import { addXP } from "@/lib/xp";
import { applyAchievementCheck } from "@/lib/achievements";
import { FatigueTracker } from "@/lib/fatigue";

interface CompetitionSimProps {
  onBack: () => void;
}

type Phase = "pre" | "active" | "break" | "ended";

const BREAK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const BREAK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_TOLERANCE = 1 / 1000; // 1 per 1000 digits

const WORLD_RANKINGS = [
  { name: "Akira Haraguchi 🇯🇵", digits: 100000, note: "Unofficial, 2006" },
  { name: "Suresh Kumar Sharma 🇮🇳", digits: 70030, note: "Unofficial, 2015" },
  { name: "Rajveer Meena 🇮🇳", digits: 70000, note: "Guinness Record, 2015" },
  { name: "Paul Hearding 🇺🇸", digits: 30448, note: "North American Record, 2025" },
  { name: "Jonas von Essen 🇸🇪", digits: 24063, note: "European Record, 2020" },
  { name: "Lu Chao 🇨🇳", digits: 67890, note: "Former Guinness, 2006" },
  { name: "Krishan Chahal 🇮🇳", digits: 43000, note: "2022" },
  { name: "Hiroyuki Goto 🇯🇵", digits: 42195, note: "Former Guinness, 1995" },
];

export default function CompetitionSim({ onBack }: CompetitionSimProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [phase, setPhase] = useState<Phase>("pre");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);
  const [breakAvailableIn, setBreakAvailableIn] = useState(BREAK_INTERVAL_MS);
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [endReason, setEndReason] = useState("");

  const startTime = useRef(0);
  const totalPausedMs = useRef(0);
  const breakStartTime = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDigitTime = useRef(0);
  const fatigueTracker = useRef(new FatigueTracker());
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";

  const formatTime = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const startCompetition = useCallback(() => {
    setPhase("active");
    startTime.current = performance.now();
    lastDigitTime.current = performance.now();
    totalPausedMs.current = 0;

    timerRef.current = setInterval(() => {
      const now = performance.now();
      const activeTime = now - startTime.current - totalPausedMs.current;
      setElapsed(activeTime);

      // Check break availability
      const timeSinceStart = now - startTime.current - totalPausedMs.current;
      const nextBreakAt = Math.ceil(timeSinceStart / BREAK_INTERVAL_MS) * BREAK_INTERVAL_MS;
      setBreakAvailableIn(nextBreakAt - timeSinceStart);
    }, 200);
  }, []);

  const takeBreak = useCallback(() => {
    setPhase("break");
    breakStartTime.current = performance.now();
    setBreakTimeLeft(BREAK_DURATION_MS);

    // Override timer for break countdown
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = BREAK_DURATION_MS - (performance.now() - breakStartTime.current);
      if (remaining <= 0) {
        totalPausedMs.current += performance.now() - breakStartTime.current;
        setPhase("active");
        setBreakTimeLeft(0);
        lastDigitTime.current = performance.now();

        // Restart active timer
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          const now = performance.now();
          const activeTime = now - startTime.current - totalPausedMs.current;
          setElapsed(activeTime);
          const timeSinceStart = now - startTime.current - totalPausedMs.current;
          const nextBreakAt = Math.ceil(timeSinceStart / BREAK_INTERVAL_MS) * BREAK_INTERVAL_MS;
          setBreakAvailableIn(nextBreakAt - timeSinceStart);
        }, 200);
      } else {
        setBreakTimeLeft(remaining);
      }
    }, 200);
  }, []);

  const endCompetition = useCallback((reason: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setEndReason(reason);
    setPhase("ended");

    const session: SessionRecord = {
      date: new Date().toISOString(),
      digitsReached: currentIndex,
      avgLatencyMs: currentIndex > 0 ? elapsed / currentIndex : 0,
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
      const correctDigits = currentIndex - errors;
      if (correctDigits > 0) {
        const [withXP] = addXP(next, correctDigits, settings.soundEnabled, settings.hapticsEnabled);
        next = withXP;
      }
      const [withAch] = applyAchievementCheck(next);
      next = withAch;
      saveState(next);
      return next;
    });
  }, [currentIndex, elapsed, errors, settings]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (phase !== "active") return;

      const now = performance.now();
      const latency = now - lastDigitTime.current;
      lastDigitTime.current = now;

      const expected = getPiDigit(currentIndex);

      if (digit === expected) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);
        fatigueTracker.current.record(true, latency);

        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);

        if (nextIndex % 1000 === 0) {
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();
        }

        if (nextIndex >= TOTAL_AVAILABLE_DIGITS) {
          endCompetition("Reached maximum available digits!");
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);
        fatigueTracker.current.record(false, latency);

        const newErrors = errors + 1;
        setErrors(newErrors);

        setAppState(prev => {
          const next = recordConfusion(prev, expected, digit);
          saveState(next);
          return next;
        });

        // Check error tolerance
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        const errorRate = newErrors / nextIndex;
        if (errorRate > ERROR_TOLERANCE && nextIndex >= 100) {
          endCompetition(`Error tolerance exceeded: ${newErrors} errors in ${nextIndex} digits (${(errorRate * 1000).toFixed(1)} per 1000)`);
        }
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [phase, currentIndex, errors, endCompetition, settings]
  );

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Escape") {
        if (phase === "active" || phase === "break") {
          endCompetition("Manually ended");
        } else {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, endCompetition, phase, onBack]);

  // Cleanup
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const canTakeBreak = breakAvailableIn <= 0 && phase === "active";
  const errorRate = currentIndex > 0 ? (errors / currentIndex) : 0;
  const dpm = elapsed > 0 ? (currentIndex / (elapsed / 60000)).toFixed(1) : "0.0";

  // Pre-competition screen
  if (phase === "pre") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🏟️</div>
          <p className="text-lg font-bold text-foreground">Simulated Official Attempt</p>

          <div className="text-left space-y-2 bg-muted/30 rounded-lg p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-sm">Competition Rules:</p>
            <p>• Continuous recitation from digit 1</p>
            <p>• 5-minute breaks allowed every 2 hours</p>
            <p>• Error tolerance: 1 wrong digit per 1,000</p>
            <p>• Auto-ends if error rate exceeded</p>
            <p>• Must start from digit 1 (3.14159...)</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={startCompetition}
              className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
            >
              🏁 BEGIN ATTEMPT
            </button>
            <button
              onClick={onBack}
              className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
            >
              BACK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Break screen
  if (phase === "break") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <div className="text-4xl">☕</div>
          <p className="text-lg font-bold text-foreground">Official Break</p>
          <div className="text-4xl font-mono text-primary">
            {formatTime(breakTimeLeft)}
          </div>
          <p className="text-sm text-muted-foreground">
            {currentIndex.toLocaleString()} digits recited so far
          </p>
          <p className="text-xs text-muted-foreground">
            Break ends automatically
          </p>
        </div>
      </div>
    );
  }

  // End screen
  if (phase === "ended") {
    // Find ranking
    const ranking = [...WORLD_RANKINGS].sort((a, b) => b.digits - a.digits);
    let rank = ranking.length + 1;
    for (let i = 0; i < ranking.length; i++) {
      if (currentIndex >= ranking[i].digits) {
        rank = i + 1;
        break;
      }
    }

    const beatsOrNearest = ranking.find(r => currentIndex >= r.digits);
    const nextTarget = ranking.filter(r => r.digits > currentIndex).sort((a, b) => a.digits - b.digits)[0];

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in w-full">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🏟️</div>
          <p className="text-lg font-bold text-foreground">Attempt Complete</p>

          <div className="text-3xl font-bold text-primary">
            {currentIndex.toLocaleString()} digits
          </div>
          <div className="text-sm text-muted-foreground">
            in {formatTime(elapsed)}
          </div>

          {endReason && (
            <div className="text-xs text-destructive bg-destructive/10 rounded px-3 py-1.5">
              {endReason}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg font-bold text-foreground">{dpm}</div>
              <div className="text-[10px] text-muted-foreground uppercase">d/min</div>
            </div>
            <div>
              <div className="text-lg font-bold text-destructive">{errors}</div>
              <div className="text-[10px] text-muted-foreground uppercase">errors</div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">
                {(errorRate * 1000).toFixed(1)}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">per 1k</div>
            </div>
          </div>

          <div className="text-sm font-semibold text-primary">
            This would rank #{rank} on the Pi World Ranking List
          </div>

          {beatsOrNearest && (
            <div className="text-xs text-green-400">
              ✓ Beats {beatsOrNearest.name} ({beatsOrNearest.digits.toLocaleString()})
            </div>
          )}
          {nextTarget && (
            <div className="text-xs text-muted-foreground">
              Next target: {nextTarget.name} ({nextTarget.digits.toLocaleString()}) — {(nextTarget.digits - currentIndex).toLocaleString()} more digits
            </div>
          )}

          {/* Rankings */}
          <div className="text-left space-y-1 max-h-48 overflow-y-auto">
            {ranking.map((r, i) => (
              <div
                key={i}
                className={`flex justify-between text-xs px-2 py-1 rounded ${
                  currentIndex >= r.digits
                    ? "bg-green-900/20 text-green-400"
                    : "bg-muted/20 text-muted-foreground"
                }`}
              >
                <span>{r.name}</span>
                <span className="font-mono">{r.digits.toLocaleString()}</span>
              </div>
            ))}
            <div className={`flex justify-between text-xs px-2 py-1 rounded bg-primary/20 text-primary font-semibold`}>
              <span>You 📍</span>
              <span className="font-mono">{currentIndex.toLocaleString()}</span>
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

  // Active competition
  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      {/* Official-looking timer */}
      <header className="text-center space-y-1 w-full">
        <div className="text-4xl font-mono font-bold text-foreground tracking-wider">
          {formatTime(elapsed)}
        </div>
        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          <span>{currentIndex.toLocaleString()} digits</span>
          <span className={errorRate > ERROR_TOLERANCE * 0.8 ? "text-destructive" : ""}>
            {errors} errors ({(errorRate * 1000).toFixed(1)}/1k)
          </span>
          <span>{dpm} d/min</span>
        </div>
        {canTakeBreak ? (
          <button
            onClick={takeBreak}
            className="mt-1 px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold animate-pulse"
          >
            ☕ TAKE BREAK (5 min)
          </button>
        ) : (
          <div className="text-[10px] text-muted-foreground/50">
            Break in {formatTime(Math.max(0, breakAvailableIn))}
          </div>
        )}
      </header>

      {/* Current digit area */}
      <div className="flex-1 flex items-center w-full">
        <div className="text-center w-full space-y-2">
          <div className="text-xs text-muted-foreground">
            Digit {(currentIndex + 1).toLocaleString()}
          </div>
          <div className="font-mono text-6xl font-bold text-primary">
            ?
          </div>
        </div>
      </div>

      <div className="w-full space-y-3">
        <Numpad
          onDigit={handleDigit}
          lastResult={lastResult}
          lastDigit={lastDigit}
          flipped={isCalculatorLayout}
        />
        <button
          onClick={() => endCompetition("Manually ended")}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          end attempt
        </button>
      </div>
    </div>
  );
}
