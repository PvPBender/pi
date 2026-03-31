import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import { getPiDigits } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { vibrateLight, vibrateError, vibrateSuccess } from "@/lib/haptics";
import {
  loadState,
  saveState,
  getChunkState,
  updateChunkState,
  sm2Update,
  getChunkArray,
  type AppState,
} from "@/lib/storage";

interface SpacedRepetitionProps {
  onBack: () => void;
}

type Phase = "test" | "result" | "done" | "batch-done";

export default function SpacedRepetition({ onBack }: SpacedRepetitionProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [allDueChunks, setAllDueChunks] = useState<number[]>([]);
  const [dueChunks, setDueChunks] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("test");
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [reviewedCount, setReviewedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [batchNumber, setBatchNumber] = useState(1);
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";
  const startTime = useRef(0);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate due chunks on mount
  useEffect(() => {
    const state = loadState();
    setAppState(state);
    const now = Date.now();
    const due: number[] = [];

    for (let i = 0; i < state.learnedChunkCount; i++) {
      const cs = getChunkState(state, i);
      if (cs.nextReview <= now || cs.totalReviews === 0) {
        due.push(i);
      }
    }

    due.sort((a, b) => {
      const csA = getChunkState(state, a);
      const csB = getChunkState(state, b);
      return csA.nextReview - csB.nextReview;
    });

    setAllDueChunks(due);
    const batchSize = state.settings.reviewBatchSize;
    const batch = due.slice(0, batchSize);
    setDueChunks(batch);

    if (batch.length === 0) {
      setPhase("done");
    } else {
      startTime.current = performance.now();
    }
  }, []);

  // Cleanup auto-advance timer
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  const currentChunkIndex = dueChunks[currentIdx];

  const getChunkDigits = useCallback((chunkIndex: number) => {
    return getPiDigits(chunkIndex * 5, 5);
  }, []);

  const moveToNext = useCallback(() => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= dueChunks.length) {
      // Check if more batches remain
      const usedCount = batchNumber * settings.reviewBatchSize;
      if (usedCount < allDueChunks.length) {
        setPhase("batch-done");
      } else {
        setPhase("done");
      }
    } else {
      setCurrentIdx(nextIdx);
      setPhase("test");
      setInput("");
      setResultMessage("");
      setFlashSuccess(false);
      startTime.current = performance.now();
    }
  }, [currentIdx, dueChunks.length, batchNumber, settings.reviewBatchSize, allDueChunks.length]);

  const loadNextBatch = useCallback(() => {
    const nextBatchStart = batchNumber * settings.reviewBatchSize;
    const nextBatch = allDueChunks.slice(nextBatchStart, nextBatchStart + settings.reviewBatchSize);
    setDueChunks(nextBatch);
    setCurrentIdx(0);
    setBatchNumber((b) => b + 1);
    setPhase("test");
    setInput("");
    setResultMessage("");
    setFlashSuccess(false);
    startTime.current = performance.now();
  }, [batchNumber, settings.reviewBatchSize, allDueChunks]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (phase === "done" || phase === "batch-done") return;

      if (phase === "result") {
        if (resultMessage.startsWith("✗")) {
          moveToNext();
        }
        return;
      }

      // Test phase
      const expected = getChunkDigits(currentChunkIndex);
      const pos = input.length;
      const expectedDigit = expected[pos];

      if (digit === expectedDigit) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);
        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === 5) {
          const elapsed = performance.now() - startTime.current;
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();

          const grade = elapsed < 3000 ? 5 : elapsed < 5000 ? 4 : 3;

          const cs = getChunkState(loadState(), currentChunkIndex);
          const updated = sm2Update(cs, grade);
          updated.lastLatencyMs = elapsed;
          const intervalDays = Math.max(1, updated.interval);

          setAppState((prev) => {
            const csPrev = getChunkState(prev, currentChunkIndex);
            const updatedPrev = sm2Update(csPrev, grade);
            updatedPrev.lastLatencyMs = elapsed;
            const newState = updateChunkState(prev, updatedPrev);
            saveState(newState);
            return newState;
          });

          setReviewedCount((c) => c + 1);
          setCorrectCount((c) => c + 1);
          setResultMessage(
            `✓ ${elapsed < 3000 ? "Fast!" : "Correct!"} Next review in ~${intervalDays}d`
          );
          setFlashSuccess(true);

          autoAdvanceTimer.current = setTimeout(() => {
            moveToNext();
          }, 300);
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);

        setAppState((prev) => {
          const cs = getChunkState(prev, currentChunkIndex);
          const updated = sm2Update(cs, 1);
          const newState = updateChunkState(prev, updated);
          saveState(newState);
          return newState;
        });

        setReviewedCount((c) => c + 1);
        setResultMessage(`✗ Expected: ${getChunkDigits(currentChunkIndex)}`);
        setPhase("result");

        setDueChunks((prev) => [...prev, currentChunkIndex]);
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [phase, currentChunkIndex, input, getChunkDigits, moveToNext, resultMessage, settings]
  );

  // Backspace support
  const handleBackspace = useCallback(() => {
    if (phase !== "test" || input.length === 0) return;
    setInput((prev) => prev.slice(0, -1));
  }, [phase, input.length]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Enter" && phase === "result") {
        moveToNext();
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, handleBackspace, phase, moveToNext, onBack]);

  // Stats
  const now = Date.now();
  const totalLearned = appState.learnedChunkCount;
  const chunkArr = getChunkArray(appState);
  const totalMastered = chunkArr.filter((c) => c.correctStreak >= 3).length;
  const totalDue = chunkArr.filter(
    (c) => c.nextReview <= now || c.totalReviews === 0
  ).length;
  const nextReviewTime = chunkArr
    .filter((c) => c.nextReview > now)
    .sort((a, b) => a.nextReview - b.nextReview)[0]?.nextReview;

  const formatTime = (ts: number) => {
    const diff = ts - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Batch done screen
  if (phase === "batch-done") {
    const remainingTotal = allDueChunks.length - batchNumber * settings.reviewBatchSize;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">✅</div>
          <p className="text-sm text-muted-foreground">
            Batch {batchNumber} complete! Reviewed {reviewedCount} chunks ({correctCount} correct)
          </p>
          <p className="text-xs text-muted-foreground">
            {remainingTotal > 0 ? `${remainingTotal} more chunks due` : "All caught up!"}
          </p>
          <div className="flex gap-3">
            {remainingTotal > 0 && (
              <button
                onClick={loadNextBatch}
                className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
              >
                CONTINUE
              </button>
            )}
            <button
              onClick={onBack}
              className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
            >
              DONE
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🎉</div>
          <p className="text-sm text-muted-foreground">
            {reviewedCount > 0
              ? `Reviewed ${reviewedCount} chunks (${correctCount} correct)`
              : "No chunks due for review!"}
          </p>
          {totalLearned === 0 && (
            <p className="text-xs text-muted-foreground">
              Learn some chunks first in Learn mode.
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 text-center mt-4">
            <div>
              <div className="text-lg font-bold text-foreground">{totalLearned}</div>
              <div className="text-[10px] text-muted-foreground uppercase">learned</div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{totalMastered}</div>
              <div className="text-[10px] text-muted-foreground uppercase">mastered</div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">
                {nextReviewTime ? formatTime(nextReviewTime) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">next review</div>
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

  const chunkDigits = getChunkDigits(currentChunkIndex);
  const remaining = dueChunks.length - currentIdx;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto transition-colors duration-300 ${flashSuccess ? "bg-green-900/20" : ""}`}>
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          review · {remaining} remaining
        </p>
      </header>

      {/* Main area */}
      <div className="flex-1 flex items-center">
        <div className="text-center space-y-4 w-full">
          {phase === "test" && (
            <div className="fade-in space-y-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                chunk {currentChunkIndex + 1} · digits{" "}
                {currentChunkIndex * 5 + 1}–{currentChunkIndex * 5 + 5}
              </div>
              <div className="font-mono text-4xl tracking-[0.4em] h-12 flex items-center justify-center">
                {input.split("").map((d, i) => (
                  <span key={i} className="text-primary font-bold">
                    {d}
                  </span>
                ))}
                {Array.from({ length: 5 - input.length }).map((_, i) => (
                  <span
                    key={`empty-${i}`}
                    className={`text-muted-foreground/30 ${
                      i === 0 ? "animate-pulse" : ""
                    }`}
                  >
                    ·
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase === "result" && (
            <div className="fade-in space-y-4">
              <div
                className={`text-lg font-semibold ${
                  resultMessage.startsWith("✓")
                    ? "text-green-400"
                    : "text-destructive"
                }`}
              >
                {resultMessage}
              </div>
              <div className="font-mono text-2xl tracking-[0.3em] text-muted-foreground">
                {chunkDigits}
              </div>
              <div className="text-xs text-muted-foreground">
                tap or enter to continue
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="w-full mb-4">
        <div className="grid grid-cols-4 gap-2 text-center max-w-[320px] mx-auto">
          <StatCell label="due" value={totalDue.toString()} />
          <StatCell label="reviewed" value={reviewedCount.toString()} />
          <StatCell label="correct" value={correctCount.toString()} />
          <StatCell label="mastered" value={totalMastered.toString()} />
        </div>
      </div>

      {/* Numpad + controls */}
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
          back to menu
        </button>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}
