import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  loadState,
  getChunkState,
  getChunkArray,
  type AppState,
  type ChunkState,
} from "@/lib/storage";
import { getPiDigits, TOTAL_AVAILABLE_DIGITS, ensureDigitsLoaded, isLoaded } from "@/lib/pi";
import { rateChunkDifficulty, getDifficultyColor, getDifficultyLabel } from "@/lib/difficulty";
import ForgettingCurve from "@/components/ForgettingCurve";

interface DigitBrowserProps {
  onBack: () => void;
  onPracticeChunk?: (chunkIndex: number) => void;
  onPracticePage?: (chunkIndex: number) => void;
}

type Level = 0 | 1 | 2;

const BLOCK_SIZE = 1000; // digits per Level 0 block
const CHUNK_SIZE = 5; // always display in 5-digit chunks for the browser
const CHUNKS_PER_BLOCK = BLOCK_SIZE / CHUNK_SIZE; // 200
const TOTAL_BLOCKS = Math.ceil(TOTAL_AVAILABLE_DIGITS / BLOCK_SIZE); // 1000

// Level 0 shows blocks in pages to avoid rendering all 1000
const BLOCKS_PER_PAGE = 100;

interface BlockMastery {
  notLearned: number;
  learning: number;
  mastered: number;
  total: number;
}

function getBlockMastery(
  blockIndex: number,
  state: AppState
): BlockMastery {
  const startChunk = (blockIndex * BLOCK_SIZE) / CHUNK_SIZE;
  const endChunk = startChunk + CHUNKS_PER_BLOCK;
  let notLearned = 0;
  let learning = 0;
  let mastered = 0;

  for (let ci = startChunk; ci < endChunk; ci++) {
    if (ci >= state.learnedChunkCount) {
      notLearned++;
    } else {
      const cs = state.chunks[ci];
      if (cs && cs.correctStreak >= 3) {
        mastered++;
      } else {
        learning++;
      }
    }
  }

  return { notLearned, learning, mastered, total: CHUNKS_PER_BLOCK };
}

function getMasteryColor(m: BlockMastery): string {
  if (m.mastered === m.total) return "#22c55e"; // green
  if (m.notLearned === m.total) return "#1a1a1a"; // dark
  const ratio = m.mastered / m.total;
  const learnRatio = m.learning / m.total;
  if (ratio > 0.7) return "#22c55e"; // mostly green
  if (ratio > 0.3) return "#eab308"; // yellow
  if (learnRatio > 0) return "#f97316"; // orange
  return "#1a1a1a";
}

function getChunkMasteryClass(ci: number, state: AppState): string {
  if (ci >= state.learnedChunkCount) return "text-zinc-700";
  const cs = state.chunks[ci];
  if (cs && cs.correctStreak >= 3) return "text-green-400";
  if (cs && cs.totalReviews > 0) return "text-amber-400";
  return "text-zinc-500";
}

export default function DigitBrowser({
  onBack,
  onPracticeChunk,
  onPracticePage,
}: DigitBrowserProps) {
  const [state, setState] = useState<AppState>(loadState);
  const [level, setLevel] = useState<Level>(0);
  const [selectedBlock, setSelectedBlock] = useState(0);
  const [selectedChunk, setSelectedChunk] = useState(0);
  const [page, setPage] = useState(0);
  const [showForgettingCurve, setShowForgettingCurve] = useState(false);
  const [digitsReady, setDigitsReady] = useState(isLoaded());

  // Ensure digits are loaded and refresh state on mount
  useEffect(() => {
    setState(loadState());
    if (!isLoaded()) {
      ensureDigitsLoaded().then(() => setDigitsReady(true));
    }
  }, []);

  // Total learned digits
  const totalLearned = state.learnedChunkCount * CHUNK_SIZE;

  // Level 0 data — MUST be before any early returns (React hooks rules)
  const totalPages = Math.ceil(TOTAL_BLOCKS / BLOCKS_PER_PAGE);
  const l0startBlock = page * BLOCKS_PER_PAGE;
  const l0endBlock = Math.min(l0startBlock + BLOCKS_PER_PAGE, TOTAL_BLOCKS);

  const blockMasteries = useMemo(() => {
    const result: BlockMastery[] = [];
    for (let i = l0startBlock; i < l0endBlock; i++) {
      result.push(getBlockMastery(i, state));
    }
    return result;
  }, [l0startBlock, l0endBlock, state]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showForgettingCurve) {
          setShowForgettingCurve(false);
        } else if (level === 2) {
          setLevel(1);
        } else if (level === 1) {
          setLevel(0);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [level, showForgettingCurve, onBack]);

  const navigateToBlock = useCallback((blockIdx: number) => {
    setSelectedBlock(blockIdx);
    setLevel(1);
  }, []);

  const navigateToChunk = useCallback((chunkIdx: number) => {
    setSelectedChunk(chunkIdx);
    setLevel(2);
  }, []);

  // Forgetting curve overlay
  if (showForgettingCurve) {
    const cs = getChunkState(state, selectedChunk);
    return (
      <ForgettingCurve
        chunk={cs}
        onClose={() => setShowForgettingCurve(false)}
      />
    );
  }

  // Loading guard — digits must be loaded for Level 1 and 2
  if (!digitsReady && level > 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-sm text-muted-foreground mt-4 animate-pulse">
          Loading digits…
        </p>
      </div>
    );
  }

  // ─── Level 2: Chunk Detail ────────────────────────
  if (level === 2) {
    const cs = getChunkState(state, selectedChunk);
    const digits = getPiDigits(selectedChunk * CHUNK_SIZE, CHUNK_SIZE);
    const diff = rateChunkDifficulty(digits);
    const accuracy =
      cs.totalReviews > 0
        ? ((cs.totalCorrect / cs.totalReviews) * 100).toFixed(1)
        : "—";
    const avgLatency = cs.lastLatencyMs
      ? `${Math.round(cs.lastLatencyMs)}ms`
      : "—";
    const lastReviewed = cs.totalReviews > 0 && cs.nextReview > 0
      ? formatDate(cs.nextReview - cs.interval * 86400000)
      : "—";
    const nextReview = cs.nextReview > 0
      ? formatDate(cs.nextReview)
      : "—";
    const isDue = cs.nextReview <= Date.now() && cs.totalReviews > 0;

    return (
      <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
        {/* Breadcrumb */}
        <div className="w-full">
          <Breadcrumb
            items={[
              { label: "All", onClick: () => setLevel(0) },
              {
                label: `${(selectedBlock * BLOCK_SIZE).toLocaleString()}–${((selectedBlock + 1) * BLOCK_SIZE).toLocaleString()}`,
                onClick: () => setLevel(1),
              },
              { label: `Chunk ${selectedChunk + 1}` },
            ]}
          />
        </div>

        <div className="flex-1 flex items-center w-full">
          <div className="text-center space-y-6 w-full fade-in">
            {/* Chunk digits */}
            <div className="font-mono text-6xl tracking-[0.4em] text-primary font-bold">
              {digits}
            </div>

            <div className="flex items-center justify-center gap-3">
              <span className={`text-sm font-semibold ${getDifficultyColor(diff)}`}>
                ◆ {diff}/10 {getDifficultyLabel(diff)}
              </span>
              <span className="text-xs text-muted-foreground">
                digits {selectedChunk * CHUNK_SIZE + 1}–
                {(selectedChunk + 1) * CHUNK_SIZE}
              </span>
            </div>

            {/* Mnemonic */}
            {cs.mnemonic && (
              <div className="text-sm text-primary bg-primary/10 rounded-lg px-3 py-2">
                💡 {cs.mnemonic}
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <StatCell label="reviews" value={cs.totalReviews.toString()} />
              <StatCell label="accuracy" value={`${accuracy}%`} />
              <StatCell label="latency" value={avgLatency} />
              <StatCell label="streak" value={cs.correctStreak.toString()} />
              <StatCell label="ease" value={cs.easeFactor.toFixed(2)} />
              <StatCell label="interval" value={`${cs.interval}d`} />
            </div>

            {/* Review dates */}
            <div className="space-y-1 text-xs">
              <div className="text-muted-foreground">
                Last reviewed: <span className="text-foreground">{lastReviewed}</span>
              </div>
              <div className={isDue ? "text-destructive" : "text-muted-foreground"}>
                Next review:{" "}
                <span className={isDue ? "text-destructive font-bold" : "text-foreground"}>
                  {isDue ? "NOW" : nextReview}
                </span>
              </div>
            </div>

            {/* Forgetting curve button */}
            <button
              onClick={() => setShowForgettingCurve(true)}
              className="text-xs px-3 py-1.5 bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              📈 Forgetting Curve
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="w-full space-y-2">
          {onPracticeChunk && (
            <button
              onClick={() => onPracticeChunk(selectedChunk)}
              className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
            >
              PRACTICE THIS CHUNK
            </button>
          )}
          {onPracticePage && (
            <button
              onClick={() => onPracticePage(selectedChunk)}
              className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm border border-border"
            >
              PRACTICE THIS PAGE
            </button>
          )}
          <button
            onClick={() => setLevel(1)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            back
          </button>
        </div>
      </div>
    );
  }

  // ─── Level 1: Page View ───────────────────────────
  if (level === 1) {
    const startChunk = (selectedBlock * BLOCK_SIZE) / CHUNK_SIZE;
    const endChunk = Math.min(startChunk + CHUNKS_PER_BLOCK, Math.ceil(TOTAL_AVAILABLE_DIGITS / CHUNK_SIZE));
    const chunkIndices: number[] = [];
    for (let ci = startChunk; ci < endChunk; ci++) {
      chunkIndices.push(ci);
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
        {/* Breadcrumb */}
        <div className="w-full">
          <Breadcrumb
            items={[
              { label: "All", onClick: () => setLevel(0) },
              {
                label: `${(selectedBlock * BLOCK_SIZE).toLocaleString()}–${((selectedBlock + 1) * BLOCK_SIZE).toLocaleString()}`,
              },
            ]}
          />
        </div>

        {/* Navigation arrows */}
        <div className="w-full flex justify-between items-center mt-2">
          <button
            onClick={() => {
              if (selectedBlock > 0) setSelectedBlock(selectedBlock - 1);
            }}
            disabled={selectedBlock === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors px-2 py-1"
          >
            ← prev
          </button>
          <span className="text-xs text-muted-foreground">
            Block {selectedBlock + 1} / {TOTAL_BLOCKS}
          </span>
          <button
            onClick={() => {
              if (selectedBlock < TOTAL_BLOCKS - 1)
                setSelectedBlock(selectedBlock + 1);
            }}
            disabled={selectedBlock >= TOTAL_BLOCKS - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors px-2 py-1"
          >
            next →
          </button>
        </div>

        {/* Chunk grid */}
        <div className="flex-1 overflow-y-auto w-full mt-2">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
            }}
          >
            {chunkIndices.map((ci) => {
              const digits = getPiDigits(ci * CHUNK_SIZE, CHUNK_SIZE);
              if (!digits) return null;
              const masteryClass = getChunkMasteryClass(ci, state);

              return (
                <button
                  key={ci}
                  onClick={() => navigateToChunk(ci)}
                  className={`font-mono text-[10px] tracking-tight py-1 rounded hover:bg-muted/50 transition-colors ${masteryClass}`}
                  title={`Chunk ${ci + 1}: ${digits}`}
                >
                  {digits}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full mt-2">
          <button
            onClick={() => setLevel(0)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            back
          </button>
        </div>
      </div>
    );
  }

  // ─── Level 0: Bird's Eye ──────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 w-full">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          digit map
        </p>
        <div className="text-sm text-muted-foreground">
          <span className="text-primary font-bold">
            {totalLearned.toLocaleString()}
          </span>{" "}
          / {TOTAL_AVAILABLE_DIGITS.toLocaleString()} digits learned
        </div>
      </header>

      {/* Legend */}
      <div className="flex gap-3 items-center text-[10px] text-muted-foreground mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} />
          <span>not learned</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#f97316" }} />
          <span>learning</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#eab308" }} />
          <span>partial</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#22c55e" }} />
          <span>mastered</span>
        </div>
      </div>

      {/* Block grid */}
      <div className="flex-1 overflow-y-auto w-full mt-3">
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
          }}
        >
          {blockMasteries.map((mastery, i) => {
            const blockIdx = l0startBlock + i;
            const color = getMasteryColor(mastery);

            return (
              <button
                key={blockIdx}
                onClick={() => navigateToBlock(blockIdx)}
                className="aspect-square rounded-sm transition-transform hover:scale-110 relative group"
                style={{ backgroundColor: color, border: "1px solid rgba(255,255,255,0.05)" }}
                title={`${(blockIdx * BLOCK_SIZE).toLocaleString()}–${((blockIdx + 1) * BLOCK_SIZE).toLocaleString()}: ${mastery.mastered}/${mastery.total} mastered`}
              >
                {/* Show label every 10 blocks */}
                {blockIdx % 10 === 0 && (
                  <span className="absolute -top-3 left-0 text-[7px] text-muted-foreground/40">
                    {(blockIdx * BLOCK_SIZE / 1000).toFixed(0)}k
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors px-2 py-1 text-xs"
          >
            ← prev
          </button>
          <span className="text-xs text-muted-foreground">
            {l0startBlock.toLocaleString()}–{l0endBlock.toLocaleString()} of{" "}
            {TOTAL_BLOCKS.toLocaleString()} blocks
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors px-2 py-1 text-xs"
          >
            next →
          </button>
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 mt-2"
      >
        back
      </button>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────

function Breadcrumb({
  items,
}: {
  items: { label: string; onClick?: () => void }[];
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 shrink-0">
          {i > 0 && <span className="text-muted-foreground/30">→</span>}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-foreground transition-colors underline underline-offset-2"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-foreground font-semibold">{item.label}</span>
          )}
        </span>
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

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
