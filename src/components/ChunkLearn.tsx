import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
  updateStreak,
  updateDailyRecord,
  sm2Update,
  type AppState,
  type ChunkState,
} from "@/lib/storage";
import { addXP } from "@/lib/xp";
import { rateChunkDifficulty, getDifficultyColor } from "@/lib/difficulty";

interface ChunkLearnProps {
  onBack: () => void;
}

type Phase = "study" | "test" | "summary" | "review-prompt";

interface PageDef {
  type: "new" | "review" | "boundary";
  /** chunk indices on this page */
  chunkIndices: number[];
  /** For boundary pages, the raw digit start position */
  digitStart?: number;
  /** Total digits on this page (chunkIndices.length * chunkSize, or custom for boundary) */
  label: string;
}

interface ChunkError {
  chunkIndex: number;
  errorCount: number;
}

const CHUNKS_PER_PAGE_OPTIONS = [5, 10, 20] as const;
type ChunksPerPage = (typeof CHUNKS_PER_PAGE_OPTIONS)[number];

const INTERLEAVE_EVERY = 3; // insert review page every N new pages

function getChunkDigits(chunkIndex: number, chunkSize: number): string {
  return getPiDigits(chunkIndex * chunkSize, chunkSize);
}

export default function ChunkLearn({ onBack }: ChunkLearnProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [phase, setPhase] = useState<Phase>("review-prompt");
  const [chunksPerPage, setChunksPerPage] = useState<ChunksPerPage>(10);
  const [dueCount, setDueCount] = useState(0);

  // Page queue
  const [pageQueue, setPageQueue] = useState<PageDef[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [newPagesSinceReview, setNewPagesSinceReview] = useState(0);

  // Test state
  const [typedDigits, setTypedDigits] = useState("");
  const [errorPositions, setErrorPositions] = useState<Set<number>>(new Set());
  const [flashPosition, setFlashPosition] = useState<number | null>(null); // position flashing red
  const [flashCorrectDigit, setFlashCorrectDigit] = useState<string | null>(null);
  const [pageErrors, setPageErrors] = useState<ChunkError[]>([]);
  const [pageStartTime, setPageStartTime] = useState(0);
  const [pageElapsed, setPageElapsed] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [pagesCompleted, setPagesCompleted] = useState(0);
  const [chunksLearnedSession, setChunksLearnedSession] = useState(0);

  // Numpad feedback
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);

  // Summary state
  const [summaryTime, setSummaryTime] = useState(0);
  const [summaryErrors, setSummaryErrors] = useState<ChunkError[]>([]);

  const settings = appState.settings;
  const chunkSize = settings.chunkSize;
  const isCalculatorLayout = settings.numpadLayout === "calculator";

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPage = pageQueue[currentPageIdx] || null;

  // All digits on current page as a single string
  const pageDigits = useMemo(() => {
    if (!currentPage) return "";
    return currentPage.chunkIndices
      .map((ci) => getChunkDigits(ci, chunkSize))
      .join("");
  }, [currentPage, chunkSize]);

  const totalPageDigits = pageDigits.length;

  // Which chunk index (within the page) the cursor is currently in
  const currentChunkInPage = useMemo(() => {
    if (!currentPage || totalPageDigits === 0) return 0;
    return Math.min(
      Math.floor(typedDigits.length / chunkSize),
      currentPage.chunkIndices.length - 1
    );
  }, [currentPage, typedDigits.length, chunkSize, totalPageDigits]);

  // Check due reviews on mount
  useEffect(() => {
    const state = loadState();
    setAppState(state);
    const now = Date.now();
    const chunks = getChunkArray(state);
    const due = chunks.filter(
      (c) =>
        c.chunkIndex < state.learnedChunkCount &&
        (c.nextReview <= now || c.totalReviews === 0)
    ).length;
    setDueCount(due);
    if (due <= 10) {
      // Go straight to learning
      initLearning(state);
    }
    // else show review-prompt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer for test phase
  useEffect(() => {
    if (phase === "test" && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setPageElapsed(performance.now() - pageStartTime);
      }, 250);
    }
    return () => {
      if (timerRef.current && phase !== "test") {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, pageStartTime]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const buildNewPages = useCallback(
    (state: AppState, count: number): PageDef[] => {
      const pages: PageDef[] = [];
      let nextChunk = state.learnedChunkCount;

      for (let p = 0; p < count; p++) {
        const indices: number[] = [];
        for (let i = 0; i < chunksPerPage; i++) {
          indices.push(nextChunk + i);
        }
        const startDigit = nextChunk * chunkSize + 1;
        const endDigit = (nextChunk + chunksPerPage) * chunkSize;
        pages.push({
          type: "new",
          chunkIndices: indices,
          label: `New · digits ${startDigit}–${endDigit}`,
        });
        nextChunk += chunksPerPage;
      }
      return pages;
    },
    [chunksPerPage, chunkSize]
  );

  const buildReviewPage = useCallback(
    (state: AppState): PageDef | null => {
      const chunks = getChunkArray(state);
      if (chunks.length === 0) return null;

      // Mix: weakest chunks + recent chunks
      const scored = chunks
        .filter((c) => c.totalReviews > 0 && c.chunkIndex < state.learnedChunkCount)
        .map((c) => {
          const accuracy =
            c.totalReviews > 0 ? c.totalCorrect / c.totalReviews : 0;
          const score = accuracy * 0.5 + Math.min(c.correctStreak / 5, 1) * 0.5;
          return { chunkIndex: c.chunkIndex, score };
        });

      scored.sort((a, b) => a.score - b.score);

      // Take weakest + some recent
      const weak = scored.slice(0, Math.ceil(chunksPerPage / 2));
      const recent = chunks
        .filter((c) => c.chunkIndex < state.learnedChunkCount)
        .sort((a, b) => b.chunkIndex - a.chunkIndex)
        .slice(0, Math.floor(chunksPerPage / 2));

      const indexSet = new Set<number>();
      const indices: number[] = [];
      for (const w of weak) {
        if (!indexSet.has(w.chunkIndex)) {
          indexSet.add(w.chunkIndex);
          indices.push(w.chunkIndex);
        }
      }
      for (const r of recent) {
        if (!indexSet.has(r.chunkIndex) && indices.length < chunksPerPage) {
          indexSet.add(r.chunkIndex);
          indices.push(r.chunkIndex);
        }
      }

      // Fill remainder if needed
      if (indices.length < chunksPerPage) {
        for (let i = 0; i < state.learnedChunkCount && indices.length < chunksPerPage; i++) {
          if (!indexSet.has(i)) {
            indices.push(i);
            indexSet.add(i);
          }
        }
      }

      if (indices.length === 0) return null;

      indices.sort((a, b) => a - b);
      return {
        type: "review",
        chunkIndices: indices.slice(0, chunksPerPage),
        label: `Review · ${indices.length} chunks`,
      };
    },
    [chunksPerPage]
  );

  const buildBoundaryPage = useCallback(
    (state: AppState): PageDef | null => {
      if (state.learnedChunkCount < chunksPerPage * 2) return null;

      // Pick chunks that straddle old/new boundary
      const boundary = state.learnedChunkCount;
      const halfPage = Math.floor(chunksPerPage / 2);
      const startIdx = Math.max(0, boundary - halfPage);
      const indices: number[] = [];
      for (let i = startIdx; i < startIdx + chunksPerPage && i < boundary; i++) {
        indices.push(i);
      }

      if (indices.length < 2) return null;

      return {
        type: "boundary",
        chunkIndices: indices,
        label: `Seam drill · chunks ${indices[0] + 1}–${indices[indices.length - 1] + 1}`,
      };
    },
    [chunksPerPage]
  );

  const initLearning = useCallback(
    (state: AppState) => {
      const pages = buildNewPages(state, 2);
      setPageQueue(pages);
      setCurrentPageIdx(0);
      setNewPagesSinceReview(0);
      startStudyPhase();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildNewPages]
  );

  const startStudyPhase = useCallback(() => {
    setPhase("study");
    setTypedDigits("");
    setErrorPositions(new Set());
    setFlashPosition(null);
    setFlashCorrectDigit(null);
    setPageErrors([]);
    setPageElapsed(0);
  }, []);

  const startTestPhase = useCallback(() => {
    setPhase("test");
    setTypedDigits("");
    setErrorPositions(new Set());
    setFlashPosition(null);
    setFlashCorrectDigit(null);
    setPageErrors([]);
    setPageStartTime(performance.now());
    setPageElapsed(0);
  }, []);

  const completePage = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const elapsed = performance.now() - pageStartTime;
    const page = currentPage;
    if (!page) return;

    // Collect errors per chunk
    const errMap = new Map<number, number>();
    errorPositions.forEach((pos) => {
      const chunkIdx = page.chunkIndices[Math.floor(pos / chunkSize)];
      if (chunkIdx !== undefined) {
        errMap.set(chunkIdx, (errMap.get(chunkIdx) || 0) + 1);
      }
    });

    const chunkErrors: ChunkError[] = [];
    errMap.forEach((count, ci) => chunkErrors.push({ chunkIndex: ci, errorCount: count }));

    // Update chunk states
    setAppState((prev) => {
      let state = { ...prev };

      for (const ci of page.chunkIndices) {
        const cs = getChunkState(state, ci);
        const errs = errMap.get(ci) || 0;
        const grade = errs === 0 ? 5 : errs === 1 ? 3 : 1;
        const updated = sm2Update(cs, grade);
        updated.lastLatencyMs = elapsed / page.chunkIndices.length;
        state = updateChunkState(state, updated);
      }

      if (page.type === "new") {
        const maxChunk = Math.max(...page.chunkIndices) + 1;
        if (maxChunk > state.learnedChunkCount) {
          const newlyLearned = maxChunk - state.learnedChunkCount;
          state = {
            ...state,
            learnedChunkCount: maxChunk,
            bestDigit: Math.max(state.bestDigit, maxChunk * chunkSize),
            todayDigitsLearned: state.todayDigitsLearned + newlyLearned * chunkSize,
          };
          state = updateStreak(state);
          state = updateDailyRecord(state, {
            digitsLearned: newlyLearned * chunkSize,
            totalPracticeMs: elapsed,
            errorsTotal: errorPositions.size,
            bestDigitReached: maxChunk * chunkSize,
          });
          setChunksLearnedSession((c) => c + newlyLearned);

          // XP for new chunks
          const [withXP] = addXP(state, newlyLearned * 5, settings.soundEnabled, settings.hapticsEnabled);
          state = withXP;
        }
      } else {
        // XP for review page
        const [withXP] = addXP(state, page.chunkIndices.length * 2, settings.soundEnabled, settings.hapticsEnabled);
        state = withXP;
      }

      saveState(state);
      return state;
    });

    setSummaryTime(elapsed);
    setSummaryErrors(chunkErrors);
    setTotalErrors((e) => e + errorPositions.size);
    setPagesCompleted((p) => p + 1);
    setPhase("summary");

    if (settings.soundEnabled) playSuccessTone();
    if (settings.hapticsEnabled) vibrateSuccess();
  }, [currentPage, errorPositions, pageStartTime, chunkSize, settings]);

  const advanceToNextPage = useCallback(() => {
    const state = loadState();
    setAppState(state);

    let nextIdx = currentPageIdx + 1;
    let queue = [...pageQueue];
    let newCount = newPagesSinceReview;

    // If current was a new page, increment counter
    if (currentPage?.type === "new") {
      newCount += 1;
      setNewPagesSinceReview(newCount);
    }

    // Insert interleave/boundary pages if needed
    if (newCount >= INTERLEAVE_EVERY && currentPage?.type === "new") {
      // Insert review page
      const reviewPage = buildReviewPage(state);
      if (reviewPage) {
        queue.splice(nextIdx, 0, reviewPage);
      }

      // Every 6 new pages, also insert a boundary page
      if (newCount >= INTERLEAVE_EVERY * 2) {
        const boundaryPage = buildBoundaryPage(state);
        if (boundaryPage) {
          queue.splice(nextIdx + (reviewPage ? 1 : 0), 0, boundaryPage);
        }
        setNewPagesSinceReview(0);
      } else if (reviewPage) {
        setNewPagesSinceReview(0);
      }
    }

    // Ensure we have pages ahead
    if (nextIdx >= queue.length) {
      const morePages = buildNewPages(state, 2);
      queue = [...queue, ...morePages];
    }

    setPageQueue(queue);
    setCurrentPageIdx(nextIdx);
    startStudyPhase();
  }, [
    currentPageIdx,
    pageQueue,
    currentPage,
    newPagesSinceReview,
    buildReviewPage,
    buildBoundaryPage,
    buildNewPages,
    startStudyPhase,
  ]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (phase === "study") {
        // Start typing → transition to test
        startTestPhase();
        // Process this digit in test mode immediately
        const expected = pageDigits[0];
        if (!expected) return;

        if (digit === expected) {
          if (settings.soundEnabled) playTone(digit);
          if (settings.hapticsEnabled) vibrateLight();
          setLastResult("correct");
          setLastDigit(digit);
          setTypedDigits(digit);
        } else {
          if (settings.soundEnabled) playErrorTone();
          if (settings.hapticsEnabled) vibrateError();
          setLastResult("error");
          setLastDigit(digit);

          // Flash error, show correct digit, auto-continue
          setFlashPosition(0);
          setFlashCorrectDigit(expected);
          setErrorPositions((prev) => new Set(prev).add(0));

          // Record confusion
          setAppState((prev) => {
            const next = recordConfusion(prev, expected, digit);
            saveState(next);
            return next;
          });

          if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = setTimeout(() => {
            setFlashPosition(null);
            setFlashCorrectDigit(null);
            setTypedDigits(expected); // auto-advance past this digit
          }, 200);
        }

        setTimeout(() => {
          setLastResult(null);
          setLastDigit(null);
        }, 150);
        return;
      }

      if (phase === "summary") {
        // Any digit press advances to next page
        advanceToNextPage();
        return;
      }

      if (phase !== "test") return;

      const pos = typedDigits.length;
      if (pos >= totalPageDigits) return;

      const expected = pageDigits[pos];

      if (digit === expected) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);

        const newTyped = typedDigits + digit;
        setTypedDigits(newTyped);

        // Check if page complete
        if (newTyped.length >= totalPageDigits) {
          completePage();
        } else if (newTyped.length % (chunkSize * 5) === 0) {
          // Mini milestone every 5 chunks
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);

        // Flash error, show correct digit briefly, then auto-advance
        setFlashPosition(pos);
        setFlashCorrectDigit(expected);
        setErrorPositions((prev) => new Set(prev).add(pos));

        // Record confusion
        setAppState((prev) => {
          const next = recordConfusion(prev, expected, digit);
          saveState(next);
          return next;
        });

        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => {
          setFlashPosition(null);
          setFlashCorrectDigit(null);
          const newTyped = typedDigits + expected; // auto-fill correct digit
          setTypedDigits(newTyped);
          if (newTyped.length >= totalPageDigits) {
            completePage();
          }
        }, 200);
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [
      phase,
      typedDigits,
      pageDigits,
      totalPageDigits,
      chunkSize,
      settings,
      startTestPhase,
      completePage,
      advanceToNextPage,
    ]
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Enter" || e.key === " ") {
        if (phase === "study") {
          startTestPhase();
        } else if (phase === "summary") {
          advanceToNextPage();
        } else if (phase === "review-prompt") {
          initLearning(loadState());
        }
      } else if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, phase, startTestPhase, advanceToNextPage, initLearning, onBack]);

  const skipReviewPrompt = useCallback(() => {
    initLearning(loadState());
  }, [initLearning]);

  // ─── Review Prompt ────────────────────────────────
  if (phase === "review-prompt") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-2xl">📋</div>
          <p className="text-sm text-muted-foreground">
            You have{" "}
            <span className="text-primary font-bold">{dueCount}</span> chunks
            due for review.
          </p>
          <p className="text-xs text-muted-foreground">
            Review first to strengthen memory?
          </p>
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

  // ─── Summary Phase ────────────────────────────────
  if (phase === "summary") {
    const timeStr = formatTime(summaryTime);
    const errorCount = summaryErrors.reduce((s, e) => s + e.errorCount, 0);

    return (
      <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">
            page complete
          </p>
        </header>

        <div className="flex-1 flex items-center">
          <div className="text-center space-y-4 w-full fade-in">
            <div className="text-4xl">
              {errorCount === 0 ? "🎉" : "📝"}
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">{timeStr}</div>
                <div className="text-[10px] text-muted-foreground uppercase">time</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${errorCount === 0 ? "text-green-400" : "text-amber-400"}`}>
                  {errorCount}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">errors</div>
              </div>
            </div>

            {summaryErrors.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  chunks with errors
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {summaryErrors.map((e) => (
                    <span
                      key={e.chunkIndex}
                      className="text-xs px-2 py-1 bg-destructive/20 text-destructive rounded"
                    >
                      #{e.chunkIndex + 1} ({e.errorCount}×)
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              tap or press any key to continue
            </div>
          </div>
        </div>

        <div className="w-full space-y-2">
          <div className="flex justify-center gap-6 text-center">
            <StatCell label="pages" value={pagesCompleted.toString()} />
            <StatCell label="learned" value={(appState.learnedChunkCount).toString()} />
            <StatCell label="+session" value={chunksLearnedSession.toString()} />
            <StatCell label="errors" value={totalErrors.toString()} />
          </div>
          <button
            onClick={advanceToNextPage}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
          >
            NEXT PAGE →
          </button>
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

  if (!currentPage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-2xl font-bold text-gradient-amber">🎉</div>
        <p className="text-muted-foreground text-sm mt-4">Session complete!</p>
        <button
          onClick={onBack}
          className="mt-4 px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
        >
          BACK
        </button>
      </div>
    );
  }

  // ─── Study Phase ──────────────────────────────────
  if (phase === "study") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
        <header className="text-center space-y-1 w-full">
          <div className="flex justify-between items-center">
            <div className="text-[10px] text-muted-foreground">
              {currentPage.type === "new" ? "📚 NEW" : currentPage.type === "review" ? "🔄 REVIEW" : "⚡ SEAM"}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
            <ChunksPerPageSelector value={chunksPerPage} onChange={setChunksPerPage} />
          </div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">
            {currentPage.label}
          </p>
        </header>

        <div className="flex-1 flex items-center w-full">
          <div className="text-center space-y-4 w-full">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">
              study these chunks — start typing when ready
            </div>

            {/* Chunk grid */}
            <div className="grid gap-y-3 gap-x-4" style={{
              gridTemplateColumns: `repeat(${Math.min(5, chunksPerPage)}, minmax(0, 1fr))`,
            }}>
              {currentPage.chunkIndices.map((ci) => {
                const digits = getChunkDigits(ci, chunkSize);
                const diff = rateChunkDifficulty(digits);
                const cs = getChunkState(appState, ci);
                const isMastered = cs.correctStreak >= 3;

                return (
                  <div key={ci} className="text-center">
                    <div
                      className={`font-mono text-lg tracking-[0.15em] font-semibold ${
                        isMastered ? "text-green-400" : "text-primary"
                      }`}
                    >
                      {digits}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[9px] text-muted-foreground/60">
                        #{ci + 1}
                      </span>
                      <span className={`text-[9px] ${getDifficultyColor(diff)}`}>
                        ◆{diff}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={startTestPhase}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
            >
              START TEST
            </button>
            <div className="text-[10px] text-muted-foreground">
              or just start typing
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
            onClick={onBack}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            back
          </button>
        </div>
      </div>
    );
  }

  // ─── Test Phase ───────────────────────────────────
  const elapsedStr = formatTime(pageElapsed);
  const currentErrorCount = errorPositions.size;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 w-full">
        <div className="flex justify-between items-center px-2">
          <div className="text-xs text-muted-foreground">
            {currentErrorCount === 0 ? (
              <span className="text-green-400">✓ 0 errors</span>
            ) : (
              <span className="text-amber-400">✗ {currentErrorCount} errors</span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-xs font-mono text-muted-foreground">{elapsedStr}</div>
        </div>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          {currentPage.label}
        </p>
      </header>

      {/* Digit display - continuous flow */}
      <div className="flex-1 flex items-center w-full overflow-hidden">
        <div className="w-full">
          <DigitFlowDisplay
            pageDigits={pageDigits}
            typedDigits={typedDigits}
            chunkSize={chunkSize}
            flashPosition={flashPosition}
            flashCorrectDigit={flashCorrectDigit}
            errorPositions={errorPositions}
            chunkIndices={currentPage.chunkIndices}
            currentChunkInPage={currentChunkInPage}
          />
        </div>
      </div>

      {/* Stats bar */}
      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell
            label="progress"
            value={`${Math.min(typedDigits.length, totalPageDigits)}/${totalPageDigits}`}
          />
          <StatCell label="chunk" value={`${currentChunkInPage + 1}/${currentPage.chunkIndices.length}`} />
          <StatCell label="errors" value={currentErrorCount.toString()} />
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-full overflow-hidden mt-2 mx-8">
          <div
            className="h-full bg-primary rounded-full transition-all duration-150"
            style={{
              width: `${totalPageDigits > 0 ? (Math.min(typedDigits.length, totalPageDigits) / totalPageDigits) * 100 : 0}%`,
            }}
          />
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
          back
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────

function DigitFlowDisplay({
  pageDigits,
  typedDigits,
  chunkSize,
  flashPosition,
  flashCorrectDigit,
  errorPositions,
  chunkIndices,
  currentChunkInPage,
}: {
  pageDigits: string;
  typedDigits: string;
  chunkSize: number;
  flashPosition: number | null;
  flashCorrectDigit: string | null;
  errorPositions: Set<number>;
  chunkIndices: number[];
  currentChunkInPage: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (cursorRef.current && containerRef.current) {
      const container = containerRef.current;
      const cursor = cursorRef.current;
      const containerRect = container.getBoundingClientRect();
      const cursorRect = cursor.getBoundingClientRect();

      if (
        cursorRect.top < containerRect.top ||
        cursorRect.bottom > containerRect.bottom
      ) {
        cursor.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [typedDigits.length]);

  // Group digits by chunk
  const chunks: { digits: string; chunkIndex: number; globalOffset: number }[] = [];
  for (let i = 0; i < chunkIndices.length; i++) {
    const offset = i * chunkSize;
    chunks.push({
      digits: pageDigits.slice(offset, offset + chunkSize),
      chunkIndex: chunkIndices[i],
      globalOffset: offset,
    });
  }

  // Determine visible window: show ~3 rows centered on current chunk
  const chunksPerRow = 5;
  const currentRow = Math.floor(currentChunkInPage / chunksPerRow);
  const startRow = Math.max(0, currentRow - 1);
  const totalRows = Math.ceil(chunks.length / chunksPerRow);
  const endRow = Math.min(totalRows, startRow + 4);

  const visibleChunks = chunks.slice(startRow * chunksPerRow, endRow * chunksPerRow);

  return (
    <div ref={containerRef} className="w-full max-h-[200px] overflow-hidden px-2">
      <div
        className="grid gap-y-3 gap-x-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(chunksPerRow, chunks.length)}, minmax(0, 1fr))`,
        }}
      >
        {visibleChunks.map((chunk) => {
          const isCurrentChunk =
            chunk.chunkIndex === chunkIndices[currentChunkInPage];

          return (
            <div
              key={chunk.chunkIndex}
              className={`text-center rounded-md py-1 px-0.5 transition-colors duration-150 ${
                isCurrentChunk
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : ""
              }`}
            >
              <div className="font-mono text-lg tracking-[0.1em] flex justify-center">
                {chunk.digits.split("").map((expectedDigit, di) => {
                  const globalPos = chunk.globalOffset + di;
                  const isTyped = globalPos < typedDigits.length;
                  const isCursor = globalPos === typedDigits.length;
                  const isFlashing = globalPos === flashPosition;
                  const hadError = errorPositions.has(globalPos);

                  let className = "";
                  let displayChar = "·";

                  if (isFlashing) {
                    className = "text-red-500 font-bold bg-red-500/20 rounded";
                    displayChar = flashCorrectDigit || expectedDigit;
                  } else if (isTyped) {
                    className = hadError
                      ? "text-amber-400 font-bold"
                      : "text-green-400 font-bold";
                    displayChar = expectedDigit;
                  } else if (isCursor) {
                    className = "text-muted-foreground animate-pulse";
                    displayChar = "·";
                  } else {
                    className = "text-muted-foreground/20";
                    displayChar = "·";
                  }

                  return (
                    <span
                      key={di}
                      ref={isCursor ? cursorRef : undefined}
                      className={className}
                    >
                      {displayChar}
                    </span>
                  );
                })}
              </div>
              <div className="text-[9px] text-muted-foreground/40">
                #{chunk.chunkIndex + 1}
              </div>
            </div>
          );
        })}
      </div>
      {startRow > 0 && (
        <div className="text-[9px] text-muted-foreground/30 text-center mt-1">
          ↑ {startRow * chunksPerRow} chunks above
        </div>
      )}
    </div>
  );
}

function ChunksPerPageSelector({
  value,
  onChange,
}: {
  value: ChunksPerPage;
  onChange: (v: ChunksPerPage) => void;
}) {
  return (
    <div className="flex gap-1">
      {CHUNKS_PER_PAGE_OPTIONS.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            value === opt
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
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

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
