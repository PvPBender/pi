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
  type AppState,
  type ChunkState,
} from "@/lib/storage";

interface ChunkLearnProps {
  onBack: () => void;
}

type Phase = "study" | "test" | "error";

interface QueueItem {
  chunkIndex: number;
  isNew: boolean;
  isBoundary?: boolean;
  boundaryStart?: number;
  boundaryLength?: number;
}

const CHUNK_SIZE = 5;
const BOUNDARY_OVERLAP = 3;
const BOUNDARY_LENGTH = BOUNDARY_OVERLAP * 2;

function getChunkDigits(chunkIndex: number): string {
  return getPiDigits(chunkIndex * CHUNK_SIZE, CHUNK_SIZE);
}

export default function ChunkLearn({ onBack }: ChunkLearnProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);
  const [phase, setPhase] = useState<Phase>("study");
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [chunksLearnedThisSession, setChunksLearnedThisSession] = useState(0);
  const isCalculatorLayout = appState.numpadLayout === "calculator";
  const toggleNumpadLayout = useCallback(() => {
    setAppState((prev) => {
      const next = { ...prev, numpadLayout: prev.numpadLayout === "calculator" ? "phone" as const : "calculator" as const };
      saveState(next);
      return next;
    });
  }, []);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const startTime = useRef(0);

  // Ref to always have current queue for closures (fixes stale closure bug)
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const currentItemRef = useRef<QueueItem | null>(null);
  currentItemRef.current = currentItem;

  const getCurrentDigits = useCallback((item: QueueItem | null): string => {
    if (!item) return "";
    if (item.isBoundary && item.boundaryStart !== undefined) {
      return getPiDigits(item.boundaryStart, item.boundaryLength ?? BOUNDARY_LENGTH);
    }
    return getChunkDigits(item.chunkIndex);
  }, []);

  const getCurrentLabel = useCallback((item: QueueItem | null): string => {
    if (!item) return "";
    if (item.isBoundary) {
      const len = item.boundaryLength ?? BOUNDARY_LENGTH;
      if (len === CHUNK_SIZE * 2) {
        return `merge ${item.chunkIndex + 1}–${item.chunkIndex + 2}`;
      }
      return `⚡ seam ${item.chunkIndex + 1}|${item.chunkIndex + 2}`;
    }
    return `chunk ${item.chunkIndex + 1}`;
  }, []);

  const startItem = useCallback((item: QueueItem) => {
    setCurrentItem(item);
    setInput("");
    setFlashSuccess(false);
    if (item.isNew) {
      setPhase("study");
    } else {
      setPhase("test");
      startTime.current = performance.now();
    }
  }, []);

  const buildFollowUpQueue = useCallback(
    (state: AppState, justLearnedIdx: number): QueueItem[] => {
      const items: QueueItem[] = [];
      const nextIdx = Math.max(state.learnedChunkCount, justLearnedIdx + 1);

      if (justLearnedIdx > 0) {
        items.push({
          chunkIndex: justLearnedIdx - 1,
          isNew: false,
          isBoundary: true,
          boundaryStart: (justLearnedIdx - 1) * CHUNK_SIZE + (CHUNK_SIZE - BOUNDARY_OVERLAP),
          boundaryLength: BOUNDARY_LENGTH,
        });
      }

      for (let i = Math.max(0, nextIdx - 4); i < nextIdx; i++) {
        const cs = getChunkState(state, i);
        if (cs.correctStreak < 5) {
          items.push({ chunkIndex: i, isNew: false });
        }
      }

      if (justLearnedIdx >= 1 && justLearnedIdx % 3 === 0) {
        for (let i = Math.max(0, justLearnedIdx - 2); i < justLearnedIdx; i++) {
          items.push({
            chunkIndex: i,
            isNew: false,
            isBoundary: true,
            boundaryStart: i * CHUNK_SIZE,
            boundaryLength: CHUNK_SIZE * 2,
          });
        }
      }

      items.push({ chunkIndex: nextIdx, isNew: true });

      return items;
    },
    []
  );

  // Build initial queue on mount
  useEffect(() => {
    const state = loadState();
    setAppState(state);
    const nextChunkIdx = state.learnedChunkCount;
    const firstItem: QueueItem = { chunkIndex: nextChunkIdx, isNew: true };
    setQueue([firstItem]);
    startItem(firstItem);
  }, [startItem]);

  const advanceToNext = useCallback(
    (passed: boolean, failedItem?: QueueItem) => {
      // Use ref to get current queue (avoids stale closure)
      const currentQueue = queueRef.current;
      let newQueue = [...currentQueue.slice(1)];

      if (!passed && failedItem) {
        const insertAt = Math.min(2, newQueue.length);
        newQueue.splice(insertAt, 0, { ...failedItem, isNew: false });
      }

      if (newQueue.filter((q) => q.isNew).length === 0 && newQueue.length < 3) {
        const state = loadState();
        const followUp = buildFollowUpQueue(state, state.learnedChunkCount - 1);
        newQueue = [...newQueue, ...followUp];
      }

      setQueue(newQueue);

      if (newQueue.length > 0) {
        startItem(newQueue[0]);
      } else {
        setCurrentItem(null);
      }
    },
    [buildFollowUpQueue, startItem]
  );

  // Backspace support
  const handleBackspace = useCallback(() => {
    if (phase !== "test" || input.length === 0) return;
    setInput((prev) => prev.slice(0, -1));
  }, [phase, input.length]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (!currentItem) return;

      if (phase === "study") {
        setPhase("test");
        startTime.current = performance.now();
        const expected = getCurrentDigits(currentItem);
        if (digit === expected[0]) {
          playTone(digit);
          vibrateLight();
          setLastResult("correct");
          setLastDigit(digit);
          setInput(digit);
          if (expected.length === 1) {
            playSuccessTone();
            vibrateSuccess();
            setFlashSuccess(true);
            setTimeout(() => advanceToNext(true), 300);
          }
        } else {
          playErrorTone();
          vibrateError();
          setLastResult("error");
          setLastDigit(digit);
          setPhase("error");
          if (!currentItem.isBoundary) {
            setAppState((prev) => {
              const cs = getChunkState(prev, currentItem.chunkIndex);
              const updated = { ...cs, correctStreak: 0, totalReviews: cs.totalReviews + 1 };
              const newState = updateChunkState(prev, updated);
              saveState(newState);
              return newState;
            });
          }
        }
        setTimeout(() => { setLastResult(null); setLastDigit(null); }, 150);
        return;
      }

      if (phase === "error") {
        advanceToNext(false, currentItem);
        return;
      }

      // Test phase
      const expected = getCurrentDigits(currentItem);
      const pos = input.length;
      const expectedDigit = expected[pos];

      if (digit === expectedDigit) {
        playTone(digit);
        vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);
        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === expected.length) {
          playSuccessTone();
          vibrateSuccess();
          setFlashSuccess(true);

          if (!currentItem.isBoundary) {
            setAppState((prev) => {
              const cs = getChunkState(prev, currentItem.chunkIndex);
              const updated: ChunkState = {
                ...cs,
                correctStreak: cs.correctStreak + 1,
                totalReviews: cs.totalReviews + 1,
                totalCorrect: cs.totalCorrect + 1,
              };
              let newState = updateChunkState(prev, updated);
              if (currentItem.isNew) {
                newState = {
                  ...newState,
                  learnedChunkCount: Math.max(newState.learnedChunkCount, currentItem.chunkIndex + 1),
                };
              }
              saveState(newState);
              return newState;
            });
            if (currentItem.isNew) {
              setChunksLearnedThisSession((c) => c + 1);
            }
          }

          setTimeout(() => advanceToNext(true), 300);
        }
      } else {
        playErrorTone();
        vibrateError();
        setLastResult("error");
        setLastDigit(digit);

        if (!currentItem.isBoundary) {
          setAppState((prev) => {
            const cs = getChunkState(prev, currentItem.chunkIndex);
            const updated = { ...cs, correctStreak: 0, totalReviews: cs.totalReviews + 1 };
            const newState = updateChunkState(prev, updated);
            saveState(newState);
            return newState;
          });
        }

        setPhase("error");
      }

      setTimeout(() => { setLastResult(null); setLastDigit(null); }, 150);
    },
    [phase, currentItem, input, getCurrentDigits, advanceToNext]
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Enter" || e.key === " ") {
        if (phase === "study") {
          setPhase("test");
          startTime.current = performance.now();
        } else if (phase === "error") {
          advanceToNext(false, currentItemRef.current ?? undefined);
        }
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, handleBackspace, phase, advanceToNext, onBack]);

  if (!currentItem) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-2xl font-bold text-gradient-amber">🎉</div>
        <p className="text-muted-foreground text-sm mt-4">Queue empty! Great work.</p>
        <button
          onClick={onBack}
          className="mt-4 px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
        >
          BACK
        </button>
      </div>
    );
  }

  const digits = getCurrentDigits(currentItem);
  const label = getCurrentLabel(currentItem);
  const masteredCount = appState.chunks.filter((c) => c.correctStreak >= 3).length;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto transition-colors duration-300 ${flashSuccess ? "bg-green-900/20" : ""}`}>
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          {label}
        </p>
      </header>

      {/* Main area */}
      <div className="flex-1 flex items-center">
        <div className="text-center space-y-4 w-full">
          {phase === "study" && (
            <div className="fade-in space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                new chunk — start typing when ready
              </div>
              <div className="font-mono text-5xl tracking-[0.5em] text-primary font-bold">
                {digits}
              </div>
              <div className="text-[10px] text-muted-foreground">
                digits {currentItem.chunkIndex * CHUNK_SIZE + 1}–{currentItem.chunkIndex * CHUNK_SIZE + CHUNK_SIZE}
                {" · "}just start typing
              </div>
            </div>
          )}

          {phase === "test" && (
            <div className="space-y-3">
              <div className="font-mono text-4xl tracking-[0.4em] flex items-center justify-center flex-wrap">
                {digits.split("").map((_, i) => (
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
              {currentItem.isBoundary && (
                <div className="text-[10px] text-amber-400/60 uppercase tracking-widest">
                  ⚡ seam
                </div>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="fade-in space-y-3">
              <div className="text-lg font-semibold text-destructive">✗</div>
              <div className="font-mono text-3xl tracking-[0.4em]">
                {digits.split("").map((d, i) => (
                  <span
                    key={i}
                    className={
                      i < input.length
                        ? "text-primary"
                        : i === input.length
                        ? "text-destructive font-bold underline"
                        : "text-muted-foreground/50"
                    }
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                tap to continue
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compact stats bar */}
      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell label="learned" value={appState.learnedChunkCount.toString()} />
          <StatCell label="mastered" value={masteredCount.toString()} />
          <StatCell label="+session" value={chunksLearnedThisSession.toString()} />
        </div>
      </div>

      {/* Numpad */}
      <div className="w-full space-y-3">
        <div className="flex justify-center gap-4 mb-1">
          <button
            onClick={toggleNumpadLayout}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border rounded"
          >
            {isCalculatorLayout ? "123↑" : "789↑"}
          </button>
        </div>
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
          back
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
