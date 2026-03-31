import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import { getPiDigits } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { vibrateLight, vibrateError, vibrateSuccess } from "@/lib/haptics";
import { loadState, saveState, recordConfusion, type AppState } from "@/lib/storage";
import { addXP } from "@/lib/xp";
import { applyAchievementCheck } from "@/lib/achievements";

interface SpeedDrillProps {
  onBack: () => void;
}

interface DrillResult {
  chunkIndex: number;
  timeMs: number;
  correct: boolean;
}

const DRILL_COUNT = 20;

export default function SpeedDrill({ onBack }: SpeedDrillProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [drillChunks, setDrillChunks] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<DrillResult[]>([]);
  const [done, setDone] = useState(false);
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";
  const targetMs = settings.targetSpeed * 5; // target for whole chunk

  // Generate random chunks
  useEffect(() => {
    const state = loadState();
    const maxChunk = state.learnedChunkCount;
    if (maxChunk < 1) {
      setDone(true);
      return;
    }

    const count = Math.min(DRILL_COUNT, maxChunk);
    const chunks: number[] = [];
    const used = new Set<number>();
    while (chunks.length < count) {
      const idx = Math.floor(Math.random() * maxChunk);
      if (!used.has(idx)) {
        used.add(idx);
        chunks.push(idx);
      }
    }
    setDrillChunks(chunks);
    startTime.current = performance.now();

    // Start timer
    timerRef.current = setInterval(() => {
      setElapsed(performance.now() - startTime.current);
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const currentChunk = drillChunks[currentIdx];
  const chunkDigits = currentChunk !== undefined ? getPiDigits(currentChunk * 5, 5) : "";

  const finishDrill = useCallback(
    (finalResults: DrillResult[]) => {
      setDone(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setResults(finalResults);

      // Award XP: 10 per correct chunk
      const correctCount = finalResults.filter(r => r.correct).length;
      if (correctCount > 0) {
        setAppState(prev => {
          let next = { ...prev };
          const [withXP] = addXP(next, correctCount * 10, settings.soundEnabled, settings.hapticsEnabled);
          next = withXP;
          const [withAch] = applyAchievementCheck(next);
          next = withAch;
          saveState(next);
          return next;
        });
      }
    },
    [settings]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (done || currentChunk === undefined) return;

      const pos = input.length;
      const expected = chunkDigits[pos];

      if (digit === expected) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);

        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === 5) {
          const timeMs = performance.now() - startTime.current;
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();

          const result: DrillResult = { chunkIndex: currentChunk, timeMs, correct: true };
          const newResults = [...results, result];

          if (currentIdx + 1 >= drillChunks.length) {
            finishDrill(newResults);
          } else {
            setResults(newResults);
            setCurrentIdx((i) => i + 1);
            setInput("");
            startTime.current = performance.now();
          }
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);

        // Record confusion
        setAppState(prev => {
          const next = recordConfusion(prev, expected, digit);
          saveState(next);
          return next;
        });

        const timeMs = performance.now() - startTime.current;
        const result: DrillResult = { chunkIndex: currentChunk, timeMs, correct: false };
        const newResults = [...results, result];

        if (currentIdx + 1 >= drillChunks.length) {
          finishDrill(newResults);
        } else {
          setResults(newResults);
          setCurrentIdx((i) => i + 1);
          setInput("");
          startTime.current = performance.now();
        }
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [done, currentChunk, chunkDigits, input, results, currentIdx, drillChunks.length, settings, finishDrill]
  );

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, onBack]);

  // Time color based on target
  const getTimeColor = (ms: number): string => {
    if (ms < targetMs) return "text-green-400";
    if (ms < targetMs * 2) return "text-yellow-400";
    return "text-red-400";
  };

  if (done) {
    const correctResults = results.filter((r) => r.correct);
    const avgTime = correctResults.length > 0
      ? correctResults.reduce((s, r) => s + r.timeMs, 0) / correctResults.length
      : 0;
    const fastest = correctResults.length > 0
      ? Math.min(...correctResults.map((r) => r.timeMs))
      : 0;
    const slowest = correctResults.length > 0
      ? Math.max(...correctResults.map((r) => r.timeMs))
      : 0;
    const accuracy = results.length > 0
      ? ((correctResults.length / results.length) * 100).toFixed(0)
      : "0";

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">⚡</div>
          <p className="text-lg font-bold text-foreground">Speed Drill Complete</p>

          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Learn some chunks first!</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className={`text-2xl font-bold ${getTimeColor(avgTime)}`}>
                    {Math.round(avgTime)}ms
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">avg time</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{accuracy}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase">accuracy</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    {Math.round(fastest)}ms
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">fastest</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">
                    {Math.round(slowest)}ms
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">slowest</div>
                </div>
              </div>

              {/* Individual results */}
              <div className="mt-4 max-h-48 overflow-y-auto space-y-1">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-xs px-2 py-1 bg-muted/30 rounded"
                  >
                    <span className="text-muted-foreground">
                      #{r.chunkIndex + 1} {getPiDigits(r.chunkIndex * 5, 5)}
                    </span>
                    <span className={r.correct ? getTimeColor(r.timeMs) : "text-destructive"}>
                      {r.correct ? `${Math.round(r.timeMs)}ms` : "✗"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

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

  const elapsedMs = Math.round(elapsed);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          speed drill · {currentIdx + 1}/{drillChunks.length}
        </p>
      </header>

      <div className="flex-1 flex items-center">
        <div className="text-center space-y-4 w-full">
          <div className={`text-3xl font-bold ${getTimeColor(elapsedMs)}`}>
            {elapsedMs}ms
          </div>

          <div className="text-xs text-muted-foreground uppercase tracking-widest">
            chunk {currentChunk + 1} · type it!
          </div>

          <div className="font-mono text-4xl tracking-[0.4em] flex items-center justify-center">
            {chunkDigits.split("").map((_, i) => (
              <span
                key={i}
                className={
                  i < input.length
                    ? "text-primary font-bold"
                    : i === input.length
                    ? "text-muted-foreground animate-pulse"
                    : "text-muted-foreground/20"
                }
              >
                {i < input.length ? input[i] : "·"}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell label="done" value={`${currentIdx}/${drillChunks.length}`} />
          <StatCell label="correct" value={results.filter((r) => r.correct).length.toString()} />
          <StatCell label="target" value={`${targetMs}ms`} />
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
          onClick={onBack}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          end drill
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
