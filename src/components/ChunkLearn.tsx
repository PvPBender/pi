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
  isNew: boolean; // true = first time seeing this chunk
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

  const getChunkDigits = useCallback((chunkIndex: number) => {
    return getPiDigits(chunkIndex * 5, 5);
  }, []);

  const advanceQueue = useCallback(
    (passed: boolean, failedChunkIndex?: number) => {
      setQueue((prev) => {
        let newQueue = [...prev.slice(1)]; // remove current item

        if (!passed && failedChunkIndex !== undefined) {
          // Re-insert failed chunk sooner (after 1-2 items)
          const insertAt = Math.min(2, newQueue.length);
          newQueue.splice(insertAt, 0, {
            chunkIndex: failedChunkIndex,
            isNew: false,
          });
        }

        // If queue is getting empty, add next new chunk + interleaved reviews
        if (newQueue.length < 3) {
          setAppState((st) => {
            const nextIdx = st.learnedChunkCount;
            // Add new chunk
            newQueue.push({ chunkIndex: nextIdx, isNew: true });
            // Add interleaved reviews of recent chunks
            for (let i = Math.max(0, nextIdx - 3); i < nextIdx; i++) {
              const cs = getChunkState(st, i);
              // Only review if not already mastered (streak < 5)
              if (cs.correctStreak < 5) {
                newQueue.push({ chunkIndex: i, isNew: false });
              }
            }
            return st;
          });
        }

        return newQueue;
      });
    },
    []
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

  // After advanceQueue, move to next item
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

  const handleDigit = useCallback(
    (digit: string) => {
      if (!currentItem) return;

      if (phase === "study") {
        // During study, tapping starts the test
        return;
      }

      if (phase === "result") {
        // Any tap moves to next
        moveToNext();
        return;
      }

      // Test phase
      const expected = getChunkDigits(currentItem.chunkIndex);
      const pos = input.length;
      const expectedDigit = expected[pos];

      if (digit === expectedDigit) {
        playTone(digit);
        setLastResult("correct");
        setLastDigit(digit);
        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === 5) {
          // Completed chunk correctly
          const elapsed = performance.now() - startTime.current;
          playSuccessTone();

          setAppState((prev) => {
            const cs = getChunkState(prev, currentItem.chunkIndex);
            const updated: ChunkState = {
              ...cs,
              correctStreak: cs.correctStreak + 1,
              totalReviews: cs.totalReviews + 1,
              totalCorrect: cs.totalCorrect + 1,
            };

            let newState = updateChunkState(prev, updated);

            // If this was a new chunk, increment learnedChunkCount
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

          setResultMessage(
            `✓ ${elapsed < 3000 ? "Fast!" : "Correct!"} (${Math.round(elapsed)}ms)`
          );
          setPhase("result");
          advanceQueue(true);
        }
      } else {
        playErrorTone();
        setLastResult("error");
        setLastDigit(digit);

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

        setResultMessage(`✗ Expected: ${expected}`);
        setPhase("result");
        advanceQueue(false, currentItem.chunkIndex);
      }

      // Clear visual feedback
      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [phase, currentItem, input, getChunkDigits, advanceQueue, moveToNext]
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

  const chunkDigits = getChunkDigits(currentItem.chunkIndex);
  const chunkState = getChunkState(appState, currentItem.chunkIndex);
  const masteredCount = appState.chunks.filter((c) => c.correctStreak >= 3).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      {/* Header */}
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          learn · chunk {currentItem.chunkIndex + 1}
        </p>
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
                {chunkDigits}
              </div>
              <div className="text-xs text-muted-foreground">
                digits {currentItem.chunkIndex * 5 + 1}–
                {currentItem.chunkIndex * 5 + 5}
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
                type from memory
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
              <div className="text-xs text-muted-foreground">
                {input.length}/5 digits
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
          <StatCell label="learned" value={appState.learnedChunkCount.toString()} />
          <StatCell label="mastered" value={masteredCount.toString()} />
          <StatCell
            label="streak"
            value={chunkState.correctStreak.toString()}
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
