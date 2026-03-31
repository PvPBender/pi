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
  getChunkArray,
  recordConfusion,
  type AppState,
  type ChunkState,
} from "@/lib/storage";
import { addXP } from "@/lib/xp";
import MnemonicEditor from "@/components/MnemonicEditor";

interface ChunkLearnProps {
  onBack: () => void;
}

type Phase = "study" | "test" | "error" | "review-prompt";

interface QueueItem {
  chunkIndex: number;
  isNew: boolean;
  isBoundary?: boolean;
  boundaryStart?: number;
  boundaryLength?: number;
}

const BOUNDARY_OVERLAP = 3;

function getChunkSize(state: AppState): number {
  return state.settings.chunkSize;
}

function getChunkDigits(chunkIndex: number, chunkSize: number): string {
  return getPiDigits(chunkIndex * chunkSize, chunkSize);
}

export default function ChunkLearn({ onBack }: ChunkLearnProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);
  const [phase, setPhase] = useState<Phase>("review-prompt"); // Start with review check
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [chunksLearnedThisSession, setChunksLearnedThisSession] = useState(0);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const startTime = useRef(0);
  const settings = appState.settings;
  const chunkSize = settings.chunkSize;
  const isCalculatorLayout = settings.numpadLayout === "calculator";
  const boundaryLength = BOUNDARY_OVERLAP * 2;

  // Ref to always have current queue for closures
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const currentItemRef = useRef<QueueItem | null>(null);
  currentItemRef.current = currentItem;

  const getCurrentDigits = useCallback((item: QueueItem | null): string => {
    if (!item) return "";
    if (item.isBoundary && item.boundaryStart !== undefined) {
      return getPiDigits(item.boundaryStart, item.boundaryLength ?? boundaryLength);
    }
    return getChunkDigits(item.chunkIndex, chunkSize);
  }, [chunkSize, boundaryLength]);

  const getCurrentLabel = useCallback((item: QueueItem | null): string => {
    if (!item) return "";
    if (item.isBoundary) {
      const len = item.boundaryLength ?? boundaryLength;
      if (len === chunkSize * 2) {
        return `merge ${item.chunkIndex + 1}–${item.chunkIndex + 2}`;
      }
      return `⚡ seam ${item.chunkIndex + 1}|${item.chunkIndex + 2}`;
    }
    return `chunk ${item.chunkIndex + 1}`;
  }, [chunkSize, boundaryLength]);

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
          boundaryStart: (justLearnedIdx - 1) * chunkSize + (chunkSize - BOUNDARY_OVERLAP),
          boundaryLength: boundaryLength,
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
            boundaryStart: i * chunkSize,
            boundaryLength: chunkSize * 2,
          });
        }
      }

      items.push({ chunkIndex: nextIdx, isNew: true });

      return items;
    },
    [chunkSize, boundaryLength]
  );

  // Check for due reviews on mount
  useEffect(() => {
    const state = loadState();
    setAppState(state);

    const now = Date.now();
    const chunks = getChunkArray(state);
    const due = chunks.filter(
      (c) => c.chunkIndex < state.learnedChunkCount && (c.nextReview <= now || c.totalReviews === 0)
    ).length;
    setDueCount(due);

    if (due > 10) {
      // Suggest reviewing first
      setPhase("review-prompt");
    } else {
      // Go straight to learning
      const nextChunkIdx = state.learnedChunkCount;
      const firstItem: QueueItem = { chunkIndex: nextChunkIdx, isNew: true };
      setQueue([firstItem]);
      startItem(firstItem);
    }
  }, [startItem]);

  const skipReviewPrompt = useCallback(() => {
    const state = loadState();
    const nextChunkIdx = state.learnedChunkCount;
    const firstItem: QueueItem = { chunkIndex: nextChunkIdx, isNew: true };
    setQueue([firstItem]);
    startItem(firstItem);
  }, [startItem]);

  const advanceToNext = useCallback(
    (passed: boolean, failedItem?: QueueItem) => {
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
          if (settings.soundEnabled) playTone(digit);
          if (settings.hapticsEnabled) vibrateLight();
          setLastResult("correct");
          setLastDigit(digit);
          setInput(digit);
          if (expected.length === 1) {
            if (settings.soundEnabled) playSuccessTone();
            if (settings.hapticsEnabled) vibrateSuccess();
            setFlashSuccess(true);
            setTimeout(() => advanceToNext(true), 300);
          }
        } else {
          if (settings.soundEnabled) playErrorTone();
          if (settings.hapticsEnabled) vibrateError();
          setLastResult("error");
          setLastDigit(digit);
          setPhase("error");
          // Record confusion
          const expectedFirst = expected[0];
          setAppState((prev) => {
            let next = recordConfusion(prev, expectedFirst, digit);
            if (!currentItem.isBoundary) {
              const cs = getChunkState(next, currentItem.chunkIndex);
              const updated = { ...cs, correctStreak: 0, totalReviews: cs.totalReviews + 1 };
              next = updateChunkState(next, updated);
            }
            saveState(next);
            return next;
          });
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
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);
        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === expected.length) {
          const elapsed = performance.now() - startTime.current;
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();
          setFlashSuccess(true);

          if (!currentItem.isBoundary) {
            setAppState((prev) => {
              const cs = getChunkState(prev, currentItem.chunkIndex);
              const updated: ChunkState = {
                ...cs,
                correctStreak: cs.correctStreak + 1,
                totalReviews: cs.totalReviews + 1,
                totalCorrect: cs.totalCorrect + 1,
                lastLatencyMs: elapsed,
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
              // Award XP for learning a new chunk
              setAppState((prev) => {
                const [withXP] = addXP(prev, 5, settings.soundEnabled, settings.hapticsEnabled);
                saveState(withXP);
                return withXP;
              });
            }
          }

          setTimeout(() => advanceToNext(true), 300);
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);

        // Record confusion
        setAppState((prev) => {
          let next = recordConfusion(prev, expectedDigit, digit);
          if (!currentItem.isBoundary) {
            const cs = getChunkState(next, currentItem.chunkIndex);
            const updated = { ...cs, correctStreak: 0, totalReviews: cs.totalReviews + 1 };
            next = updateChunkState(next, updated);
          }
          saveState(next);
          return next;
        });

        setPhase("error");
      }

      setTimeout(() => { setLastResult(null); setLastDigit(null); }, 150);
    },
    [phase, currentItem, input, getCurrentDigits, advanceToNext, settings]
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
        } else if (phase === "review-prompt") {
          skipReviewPrompt();
        }
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, handleBackspace, phase, advanceToNext, onBack, skipReviewPrompt]);

  // Review prompt
  if (phase === "review-prompt") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-2xl">📋</div>
          <p className="text-sm text-muted-foreground">
            You have <span className="text-primary font-bold">{dueCount}</span> chunks due for review.
          </p>
          <p className="text-xs text-muted-foreground">Review first to strengthen memory?</p>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
            >
              REVIEW FIRST
            </button>
            <button
              onClick={skipReviewPrompt}
              className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
            >
              LEARN NEW
            </button>
          </div>
        </div>
      </div>
    );
  }

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
  const chunkArr = getChunkArray(appState);
  const masteredCount = chunkArr.filter((c) => c.correctStreak >= 3).length;

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
                digits {currentItem.chunkIndex * chunkSize + 1}–{currentItem.chunkIndex * chunkSize + chunkSize}
                {" · "}just start typing
              </div>
              {!currentItem.isBoundary && (
                <MnemonicEditor
                  digits={digits}
                  currentMnemonic={getChunkState(appState, currentItem.chunkIndex).mnemonic}
                  onSelect={(mnemonic) => {
                    setAppState((prev) => {
                      const cs = getChunkState(prev, currentItem.chunkIndex);
                      const updated = { ...cs, mnemonic };
                      const next = updateChunkState(prev, updated);
                      saveState(next);
                      return next;
                    });
                  }}
                />
              )}
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
              {!currentItem.isBoundary && (
                <MnemonicEditor
                  digits={digits}
                  currentMnemonic={getChunkState(appState, currentItem.chunkIndex).mnemonic}
                  onSelect={() => {}}
                  readOnly
                />
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
