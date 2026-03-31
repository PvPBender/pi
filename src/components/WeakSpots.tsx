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
  calculateWeakChunks,
  type AppState,
} from "@/lib/storage";

interface WeakSpotsProps {
  onBack: () => void;
}

type Phase = "test" | "error" | "done";

export default function WeakSpots({ onBack }: WeakSpotsProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [weakChunks, setWeakChunks] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("test");
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const startTime = useRef(0);
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";

  // Calculate weak chunks on mount
  useEffect(() => {
    const state = loadState();
    setAppState(state);
    const weak = calculateWeakChunks(state, 20);

    // Shuffle
    for (let i = weak.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [weak[i], weak[j]] = [weak[j], weak[i]];
    }

    setWeakChunks(weak);
    if (weak.length === 0) {
      setPhase("done");
    } else {
      startTime.current = performance.now();
    }

    // Save weak chunks cache
    const updated = { ...state, weakChunks: weak };
    saveState(updated);
  }, []);

  const currentChunkIndex = weakChunks[currentIdx];
  const chunkDigits = currentChunkIndex !== undefined ? getPiDigits(currentChunkIndex * 5, 5) : "";

  const moveToNext = useCallback(() => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= weakChunks.length) {
      setPhase("done");
    } else {
      setCurrentIdx(nextIdx);
      setPhase("test");
      setInput("");
      setFlashSuccess(false);
      startTime.current = performance.now();
    }
  }, [currentIdx, weakChunks.length]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (phase === "done") return;

      if (phase === "error") {
        moveToNext();
        return;
      }

      // Test phase
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
          const elapsed = performance.now() - startTime.current;
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();

          const grade = elapsed < 3000 ? 5 : elapsed < 5000 ? 4 : 3;

          setAppState((prev) => {
            const cs = getChunkState(prev, currentChunkIndex);
            const updated = sm2Update(cs, grade);
            updated.lastLatencyMs = elapsed;
            const newState = updateChunkState(prev, updated);
            saveState(newState);
            return newState;
          });

          setReviewedCount((c) => c + 1);
          setCorrectCount((c) => c + 1);
          setFlashSuccess(true);

          setTimeout(() => moveToNext(), 300);
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
        setPhase("error");

        // Re-add to end of queue
        setWeakChunks((prev) => [...prev, currentChunkIndex]);
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [phase, currentChunkIndex, chunkDigits, input, moveToNext, settings]
  );

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Enter" && phase === "error") moveToNext();
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, phase, moveToNext, onBack]);

  if (phase === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🎯</div>
          <p className="text-sm text-muted-foreground">
            {reviewedCount > 0
              ? `Drilled ${reviewedCount} weak spots (${correctCount} correct first try)`
              : "No weak spots found! Great mastery!"}
          </p>
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

  const remaining = weakChunks.length - currentIdx;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto transition-colors duration-300 ${flashSuccess ? "bg-green-900/20" : ""}`}>
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          weak spots · {remaining} remaining
        </p>
      </header>

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
                  <span key={i} className="text-primary font-bold">{d}</span>
                ))}
                {Array.from({ length: 5 - input.length }).map((_, i) => (
                  <span
                    key={`e-${i}`}
                    className={`text-muted-foreground/30 ${i === 0 ? "animate-pulse" : ""}`}
                  >
                    ·
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="fade-in space-y-3">
              <div className="text-lg font-semibold text-destructive">✗</div>
              <div className="font-mono text-2xl tracking-[0.3em] text-muted-foreground">
                {chunkDigits}
              </div>
              <div className="text-xs text-muted-foreground">tap to continue</div>
            </div>
          )}
        </div>
      </div>

      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell label="reviewed" value={reviewedCount.toString()} />
          <StatCell label="correct" value={correctCount.toString()} />
          <StatCell label="remaining" value={remaining.toString()} />
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
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
