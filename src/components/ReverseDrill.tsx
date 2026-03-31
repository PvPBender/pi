import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import { getPiDigits } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { vibrateLight, vibrateError, vibrateSuccess } from "@/lib/haptics";
import { loadState, saveState, recordConfusion, type AppState } from "@/lib/storage";
import { addXP } from "@/lib/xp";
import { applyAchievementCheck } from "@/lib/achievements";

interface ReverseDrillProps {
  onBack: () => void;
}

type SubMode = "position-to-digits" | "digits-to-position" | null;
type Phase = "playing" | "result" | "done";

const TOTAL_ROUNDS = 20;

interface RoundResult {
  correct: boolean;
  timeMs: number;
}

export default function ReverseDrill({ onBack }: ReverseDrillProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [subMode, setSubMode] = useState<SubMode>(null);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState<string | null>(null);
  const startTime = useRef(0);
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";
  const maxChunk = appState.learnedChunkCount;

  const generateChunk = useCallback(() => {
    if (maxChunk < 1) return 0;
    return Math.floor(Math.random() * maxChunk);
  }, [maxChunk]);

  const startRound = useCallback(() => {
    setCurrentChunkIdx(generateChunk());
    setInput("");
    setShowAnswer(null);
    setPhase("playing");
    startTime.current = performance.now();
  }, [generateChunk]);

  useEffect(() => {
    if (subMode && maxChunk > 0) {
      startRound();
    }
  }, [subMode, maxChunk, startRound]);

  const finishSession = useCallback((finalResults: RoundResult[]) => {
    setPhase("done");
    setResults(finalResults);

    // Award XP
    const correctCount = finalResults.filter(r => r.correct).length;
    setAppState(prev => {
      let next = { ...prev };
      const [withXP] = addXP(next, correctCount * 5, settings.soundEnabled, settings.hapticsEnabled);
      next = withXP;
      const [withAch] = applyAchievementCheck(next);
      next = withAch;
      saveState(next);
      return next;
    });
  }, [settings]);

  const handleCorrect = useCallback(() => {
    const timeMs = performance.now() - startTime.current;
    if (settings.soundEnabled) playSuccessTone();
    if (settings.hapticsEnabled) vibrateSuccess();

    const newResults = [...results, { correct: true, timeMs }];

    if (round + 1 >= TOTAL_ROUNDS) {
      finishSession(newResults);
    } else {
      setResults(newResults);
      setRound(r => r + 1);
      setTimeout(() => startRound(), 300);
    }
  }, [results, round, finishSession, startRound, settings]);

  const handleWrong = useCallback((answer: string) => {
    const timeMs = performance.now() - startTime.current;
    if (settings.soundEnabled) playErrorTone();
    if (settings.hapticsEnabled) vibrateError();
    setShowAnswer(answer);

    const newResults = [...results, { correct: false, timeMs }];

    setTimeout(() => {
      if (round + 1 >= TOTAL_ROUNDS) {
        finishSession(newResults);
      } else {
        setResults(newResults);
        setRound(r => r + 1);
        startRound();
      }
    }, 1200);
  }, [results, round, finishSession, startRound, settings]);

  // Position → Digits mode
  const handleDigitP2D = useCallback((digit: string) => {
    if (phase !== "playing" || subMode !== "position-to-digits") return;

    const expected = getPiDigits(currentChunkIdx * 5, 5);
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
        handleCorrect();
      }
    } else {
      setLastResult("error");
      setLastDigit(digit);

      // Record confusion
      setAppState(prev => {
        const next = recordConfusion(prev, expectedDigit, digit);
        saveState(next);
        return next;
      });

      handleWrong(expected);
    }

    setTimeout(() => { setLastResult(null); setLastDigit(null); }, 150);
  }, [phase, subMode, currentChunkIdx, input, settings, handleCorrect, handleWrong]);

  // Digits → Position mode
  const handleDigitD2P = useCallback((digit: string) => {
    if (phase !== "playing" || subMode !== "digits-to-position") return;

    if (settings.soundEnabled) playTone(digit);
    if (settings.hapticsEnabled) vibrateLight();
    setLastResult("correct");
    setLastDigit(digit);

    const newInput = input + digit;
    setInput(newInput);

    // Check when user submits (they need to type the chunk number)
    // Auto-check after reasonable length
    const expectedNum = (currentChunkIdx + 1).toString();
    if (newInput.length === expectedNum.length) {
      if (newInput === expectedNum) {
        handleCorrect();
      } else {
        handleWrong(expectedNum);
      }
    } else if (newInput.length > expectedNum.length) {
      handleWrong(expectedNum);
    }

    setTimeout(() => { setLastResult(null); setLastDigit(null); }, 150);
  }, [phase, subMode, currentChunkIdx, input, settings, handleCorrect, handleWrong]);

  const handleDigit = useCallback((digit: string) => {
    if (subMode === "position-to-digits") handleDigitP2D(digit);
    else if (subMode === "digits-to-position") handleDigitD2P(digit);
  }, [subMode, handleDigitP2D, handleDigitD2P]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Escape") onBack();
      else if (e.key === "Backspace" && subMode === "digits-to-position") {
        setInput(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, onBack, subMode]);

  // Mode selection
  if (subMode === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🔄</div>
          <p className="text-lg font-bold text-foreground">Reverse Drill</p>

          {maxChunk < 1 ? (
            <>
              <p className="text-sm text-muted-foreground">Learn some chunks first!</p>
              <button onClick={onBack} className="px-5 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm">BACK</button>
            </>
          ) : (
            <div className="space-y-3 w-full max-w-xs">
              <button
                onClick={() => setSubMode("position-to-digits")}
                className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm border border-border hover:opacity-90"
              >
                📍 Position → Digits
                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                  Given a position, type the digits
                </span>
              </button>
              <button
                onClick={() => setSubMode("digits-to-position")}
                className="w-full px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm border border-border hover:opacity-90"
              >
                🔢 Digits → Position
                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                  Given digits, type the chunk number
                </span>
              </button>
              <button onClick={onBack} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
                back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Done screen
  if (phase === "done") {
    const correctCount = results.filter(r => r.correct).length;
    const correctResults = results.filter(r => r.correct);
    const avgTime = correctResults.length > 0
      ? correctResults.reduce((s, r) => s + r.timeMs, 0) / correctResults.length
      : 0;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">🔄</div>
          <p className="text-lg font-bold text-foreground">Reverse Drill Complete</p>

          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <div className="text-2xl font-bold text-primary">{correctCount}/{results.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase">score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{Math.round(avgTime)}ms</div>
              <div className="text-[10px] text-muted-foreground uppercase">avg time</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">
                {results.length > 0 ? ((correctCount / results.length) * 100).toFixed(0) : 0}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">accuracy</div>
            </div>
          </div>

          <button onClick={onBack} className="px-5 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm mt-4">
            BACK TO MENU
          </button>
        </div>
      </div>
    );
  }

  const chunkDigits = getPiDigits(currentChunkIdx * 5, 5);
  const position = currentChunkIdx * 5 + 1;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          reverse drill · {round + 1}/{TOTAL_ROUNDS}
        </p>
      </header>

      <div className="flex-1 flex items-center">
        <div className="text-center space-y-4 w-full">
          {subMode === "position-to-digits" && (
            <div className="space-y-4 fade-in">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Position {position.toLocaleString()}
              </div>
              <div className="text-lg text-muted-foreground">
                Chunk #{currentChunkIdx + 1}
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
              {showAnswer && (
                <div className="text-sm text-destructive fade-in">
                  ✗ Correct: <span className="font-mono font-bold">{showAnswer}</span>
                </div>
              )}
            </div>
          )}

          {subMode === "digits-to-position" && (
            <div className="space-y-4 fade-in">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                What chunk # is this?
              </div>
              <div className="font-mono text-4xl tracking-[0.4em] text-primary font-bold">
                {chunkDigits}
              </div>
              <div className="font-mono text-3xl text-foreground">
                {input || <span className="text-muted-foreground/30 animate-pulse">?</span>}
              </div>
              {showAnswer && (
                <div className="text-sm text-destructive fade-in">
                  ✗ Correct: chunk #{showAnswer}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell label="round" value={`${round + 1}/${TOTAL_ROUNDS}`} />
          <StatCell label="correct" value={results.filter(r => r.correct).length.toString()} />
          <StatCell label="errors" value={results.filter(r => !r.correct).length.toString()} />
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
