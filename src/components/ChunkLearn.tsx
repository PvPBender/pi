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

type Phase = "study" | "test" | "result";

interface QueueItem {
  chunkIndex: number;
  isNew: boolean;
  // Boundary items span across two chunks (overlap drilling)
  isBoundary?: boolean;
  boundaryStart?: number; // absolute digit index where the boundary segment starts
  boundaryLength?: number;
}

const CHUNK_SIZE = 5;
// Boundary segments: last 3 of chunk N + first 3 of chunk N+1 = 6 digits crossing the seam
const BOUNDARY_OVERLAP = 3;
const BOUNDARY_LENGTH = BOUNDARY_OVERLAP * 2;

function getBoundaryDigits(chunkIndex: number): { digits: string; start: number } {
  // Get digits that straddle the boundary between chunkIndex and chunkIndex+1
  const start = chunkIndex * CHUNK_SIZE + (CHUNK_SIZE - BOUNDARY_OVERLAP);
  return { digits: getPiDigits(start, BOUNDARY_LENGTH), start };
}

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
  const [resultMessage, setResultMessage] = useState("");
  const [chunksLearnedThisSession, setChunksLearnedThisSession] = useState(0);
  const [flippedNumpad, setFlippedNumpad] = useState(false);
  const startTime = useRef(0);

  // Build initial queue on mount
  useEffect(() => {
    const state = loadState();
    setAppState(state);
    const nextChunkIdx = state.learnedChunkCount;
    const initialQueue: QueueItem[] = [{ chunkIndex: nextChunkIdx, isNew: true }];
    setQueue(initialQueue);
    setCurrentItem(initialQueue[0]);
    setPhase("study");
  }, []);

  const buildFollowUpQueue = useCallback(
    (state: AppState, justLearnedIdx: number): QueueItem[] => {
      const items: QueueItem[] = [];
      const nextIdx = Math.max(state.learnedChunkCount, justLearnedIdx + 1);

      // Add boundary drill if we have at least 2 learned chunks
      // Drill the boundary between the just-learned chunk and the previous one
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

      // After every 3 chunks learned, add a "merge drill" — two consecutive chunks as one 10-digit test
      if (justLearnedIdx >= 1 && justLearnedIdx % 3 === 0) {
        // Drill pairs: e.g., after learning chunk 3, drill 0+1, 1+2, 2+3 as merged pairs
        for (let i = Math.max(0, justLearnedIdx - 2); i < justLearnedIdx; i++) {
          items.push({
            chunkIndex: i,
            isNew: false,
            isBoundary: true,
            boundaryStart: i * CHUNK_SIZE,
            boundaryLength: CHUNK_SIZE * 2, // 10 digits spanning two chunks
          });
        }
      }

      // Add next new chunk
      items.push({ chunkIndex: nextIdx, isNew: true });

      return items;
    },
    []
  );

  const advanceQueue = useCallback(
    (passed: boolean, failedItem?: QueueItem) => {
      setQueue((prev) => {
        let newQueue = [...prev.slice(1)];

        if (!passed && failedItem) {
          // Re-insert failed item sooner (after 1-2 items)
          const insertAt = Math.min(2, newQueue.length);
          newQueue.splice(insertAt, 0, {
            ...failedItem,
            isNew: false,
          });
        }

        // If queue is getting low, build more items
        if (newQueue.filter((q) => q.isNew).length === 0 && newQueue.length < 3) {
          setAppState((st) => {
            const followUp = buildFollowUpQueue(st, st.learnedChunkCount - 1);
            newQueue = [...newQueue, ...followUp];
            return st;
          });
        }

        return newQueue;
      });
    },
    [buildFollowUpQueue]
  );

  const moveToNext = useCallback(() => {
    setQueue((prev) => {
      if (prev.length > 0) {
        setCurrentItem(prev[0]);
        setPhase(prev[0].isNew ? "study" : "test");
      } else {
        setCurrentItem(null);
      }
      return prev;
    });
    setInput("");
    setResultMessage("");
    startTime.current = performance.now();
  }, []);

  useEffect(() => {
    if (!currentItem && queue.length > 0) {
      setCurrentItem(queue[0]);
      setPhase(queue[0].isNew ? "study" : "test");
      setInput("");
      startTime.current = performance.now();
    }
  }, [queue, currentItem]);

  const startTest = useCallback(() => {
    setPhase("test");
    setInput("");
    startTime.current = performance.now();
  }, []);

  const getCurrentDigits = useCallback((): string => {
    if (!currentItem) return "";
    if (currentItem.isBoundary && currentItem.boundaryStart !== undefined) {
      return getPiDigits(currentItem.boundaryStart, currentItem.boundaryLength ?? BOUNDARY_LENGTH);
    }
    return getChunkDigits(currentItem.chunkIndex);
  }, [currentItem]);

  const getCurrentLabel = useCallback((): string => {
    if (!currentItem) return "";
    if (currentItem.isBoundary && currentItem.boundaryStart !== undefined) {
      const len = currentItem.boundaryLength ?? BOUNDARY_LENGTH;
      const end = currentItem.boundaryStart + len;
      if (len === CHUNK_SIZE * 2) {
        return `merge · chunks ${currentItem.chunkIndex + 1}–${currentItem.chunkIndex + 2}`;
      }
      return `boundary · digits ${currentItem.boundaryStart + 1}–${end}`;
    }
    return `chunk ${currentItem.chunkIndex + 1}`;
  }, [currentItem]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (!currentItem) return;
      if (phase === "study") return;

      if (phase === "result") {
        moveToNext();
        return;
      }

      // Test phase
      const expected = getCurrentDigits();
      const pos = input.length;
      const expectedDigit = expected[pos];

      if (digit === expectedDigit) {
        playTone(digit);
        setLastResult("correct");
        setLastDigit(digit);
        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === expected.length) {
          const elapsed = performance.now() - startTime.current;
          playSuccessTone();

          // Only update chunk state for regular chunk tests (not boundary)
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
                  learnedChunkCount: Math.max(
                    newState.learnedChunkCount,
                    currentItem.chunkIndex + 1
                  ),
                };
              }

              saveState(newState);
              return newState;
            });

            if (currentItem.isNew) {
              setChunksLearnedThisSession((c) => c + 1);
            }
          }

          const label = currentItem.isBoundary ? "Boundary nailed!" : (elapsed < 3000 ? "Fast!" : "Correct!");
          setResultMessage(`✓ ${label} (${Math.round(elapsed)}ms)`);
          setPhase("result");
          advanceQueue(true);
        }
      } else {
        playErrorTone();
        setLastResult("error");
        setLastDigit(digit);

        if (!currentItem.isBoundary) {
          setAppState((prev) => {
            const cs = getChunkState(prev, currentItem.chunkIndex);
            const updated: ChunkState = {
              ...cs,
              correctStreak: 0,
              totalReviews: cs.totalReviews + 1,
            };
            const newState = updateChunkState(prev, updated);
            saveState(newState);
            return newState;
          });
        }

        setResultMessage(`✗ Expected: ${expected}`);
        setPhase("result");
        advanceQueue(false, currentItem);
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [phase, currentItem, input, getCurrentDigits, advanceQueue, moveToNext]
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Enter") {
        if (phase === "study") startTest();
        else if (phase === "result") moveToNext();
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, phase, startTest, moveToNext, onBack]);

  if (!currentItem) {
    return (
      <div className="text-center space-y-4">
        <div className="text-2xl font-bold text-gradient-amber">🎉</div>
        <p className="text-muted-foreground text-sm">Queue empty! Great work.</p>
        <button
          onClick={onBack}
          className="px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
        >
          BACK
        </button>
      </div>
    );
  }

  const digits = getCurrentDigits();
  const label = getCurrentLabel();
  const chunkState = getChunkState(appState, currentItem.chunkIndex);
  const masteredCount = appState.chunks.filter((c) => c.correctStreak >= 3).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          learn · {label}
        </p>
        {currentItem.isBoundary && (
          <p className="text-[10px] text-amber-400/70 tracking-widest uppercase">
            ⚡ seam drill
          </p>
        )}
      </header>

      {/* Main area */}
      <div className="flex-1 flex items-center">
        <div className="text-center space-y-4 w-full">
          {phase === "study" && (
            <div className="fade-in space-y-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                memorize this chunk
              </div>
              <div className="font-mono text-4xl tracking-[0.4em] text-primary font-bold">
                {digits}
              </div>
              <div className="text-xs text-muted-foreground">
                digits {currentItem.chunkIndex * CHUNK_SIZE + 1}–
                {currentItem.chunkIndex * CHUNK_SIZE + CHUNK_SIZE}
              </div>
              <button
                onClick={startTest}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm tracking-wide hover:opacity-90 transition-opacity"
              >
                READY — TEST ME
              </button>
              <div className="text-[10px] text-muted-foreground">enter · start test</div>
            </div>
          )}

          {phase === "test" && (
            <div className="fade-in space-y-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                {currentItem.isBoundary ? "type across the seam" : "type from memory"}
              </div>
              <div className="font-mono text-4xl tracking-[0.3em] h-12 flex items-center justify-center flex-wrap">
                {input.split("").map((d, i) => (
                  <span key={i} className="text-primary font-bold">
                    {d}
                  </span>
                ))}
                {Array.from({ length: digits.length - input.length }).map((_, i) => (
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
              <div className="text-xs text-muted-foreground">
                {input.length}/{digits.length} digits
              </div>
              {/* For boundary/merge tests, show grouping hint */}
              {currentItem.isBoundary && (
                <div className="text-[10px] text-muted-foreground/50">
                  {currentItem.boundaryLength === CHUNK_SIZE * 2
                    ? `two chunks merged (${CHUNK_SIZE}+${CHUNK_SIZE})`
                    : `${BOUNDARY_OVERLAP} digits from each side of the boundary`}
                </div>
              )}
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
              {/* Show digits with visual boundary marker */}
              <div className="font-mono text-2xl tracking-[0.3em] text-muted-foreground">
                {currentItem.isBoundary && currentItem.boundaryLength === BOUNDARY_LENGTH ? (
                  <>
                    <span className="text-muted-foreground">{digits.slice(0, BOUNDARY_OVERLAP)}</span>
                    <span className="text-amber-400 mx-0.5">│</span>
                    <span className="text-muted-foreground">{digits.slice(BOUNDARY_OVERLAP)}</span>
                  </>
                ) : currentItem.isBoundary && currentItem.boundaryLength === CHUNK_SIZE * 2 ? (
                  <>
                    <span className="text-muted-foreground">{digits.slice(0, CHUNK_SIZE)}</span>
                    <span className="text-amber-400 mx-1"> </span>
                    <span className="text-muted-foreground">{digits.slice(CHUNK_SIZE)}</span>
                  </>
                ) : (
                  digits
                )}
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
          <StatCell label="learned" value={appState.learnedChunkCount.toString()} />
          <StatCell label="mastered" value={masteredCount.toString()} />
          <StatCell
            label="streak"
            value={currentItem.isBoundary ? "—" : chunkState.correctStreak.toString()}
          />
          <StatCell label="session" value={`+${chunksLearnedThisSession}`} />
        </div>
      </div>

      {/* Numpad + controls */}
      <div className="w-full space-y-3">
        {phase !== "study" && (
          <>
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
          </>
        )}
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
