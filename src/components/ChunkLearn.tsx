import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import { getPiDigits } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
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

// "study" = only for brand-new chunks, shows digits briefly
// "test" = typing digits (the main state — auto-entered for reviews)
// "error" = wrong answer, shows correct digits, tap to retry
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
  const [flippedNumpad, setFlippedNumpad] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const startTime = useRef(0);

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

  // Start a queue item — new chunks get study phase, everything else goes straight to test
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

      // Boundary drill between just-learned and previous
      if (justLearnedIdx > 0) {
        items.push({
          chunkIndex: justLearnedIdx - 1,
          isNew: false,
          isBoundary: true,
          boundaryStart: (justLearnedIdx - 1) * CHUNK_SIZE + (CHUNK_SIZE - BOUNDARY_OVERLAP),
          boundaryLength: BOUNDARY_LENGTH,
        });
      }

      // Interleaved reviews of recent chunks
      for (let i = Math.max(0, nextIdx - 4); i < nextIdx; i++) {
        const cs = getChunkState(state, i);
        if (cs.correctStreak < 5) {
          items.push({ chunkIndex: i, isNew: false });
        }
      }

      // Every 3 chunks: merge drills
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

      // Next new chunk
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
    (currentQueue: QueueItem[], passed: boolean, failedItem?: QueueItem) => {
      let newQueue = [...currentQueue.slice(1)];

      if (!passed && failedItem) {
        const insertAt = Math.min(2, newQueue.length);
        newQueue.splice(insertAt, 0, { ...failedItem, isNew: false });
      }

      // Refill if running low
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

  const handleDigit = useCallback(
    (digit: string) => {
      if (!currentItem) return;

      // In study phase, first digit tap starts the test
      if (phase === "study") {
        setPhase("test");
        startTime.current = performance.now();
        // Process this digit as the first test input
        const expected = getCurrentDigits(currentItem);
        if (digit === expected[0]) {
          playTone(digit);
          setLastResult("correct");
          setLastDigit(digit);
          setInput(digit);
          // If chunk is only 1 digit (shouldn't happen, but safe)
          if (expected.length === 1) {
            playSuccessTone();
            setFlashSuccess(true);
            setTimeout(() => advanceToNext(queue, true), 300);
          }
        } else {
          playErrorTone();
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

      // In error phase, any tap moves to next
      if (phase === "error") {
        advanceToNext(queue, false, currentItem);
        return;
      }

      // Test phase — the core loop
      const expected = getCurrentDigits(currentItem);
      const pos = input.length;
      const expectedDigit = expected[pos];

      if (digit === expectedDigit) {
        playTone(digit);
        setLastResult("correct");
        setLastDigit(digit);
        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === expected.length) {
          // Completed! Flash green and auto-advance
          const elapsed = performance.now() - startTime.current;
          playSuccessTone();
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

          // Auto-advance after brief flash (300ms)
          setTimeout(() => advanceToNext(queue, true), 300);
        }
      } else {
        // Wrong digit — show error, require tap to continue
        playErrorTone();
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
    [phase, currentItem, input, getCurrentDigits, advanceToNext, queue]
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Enter" || e.key === " ") {
        if (phase === "study") {
          setPhase("test");
          startTime.current = performance.now();
        } else if (phase === "error") {
          advanceToNext(queue, false, currentItem ?? undefined);
        }
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, phase, queue, currentItem, advanceToNext, onBack]);

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
  const chunkState = getChunkState(appState, currentItem.chunkIndex);
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
              {/* Show digits being typed with slots */}
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
              {/* Show the correct answer with what they got wrong highlighted */}
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
