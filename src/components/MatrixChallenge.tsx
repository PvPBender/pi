import { useState, useCallback, useEffect, useRef } from "react";
import Numpad from "@/components/Numpad";
import { getPiDigits } from "@/lib/pi";
import { playTone, playErrorTone, playSuccessTone } from "@/lib/audio";
import { vibrateLight, vibrateError, vibrateSuccess } from "@/lib/haptics";
import { loadState, saveState, recordConfusion, type AppState } from "@/lib/storage";
import { addXP } from "@/lib/xp";
import { applyAchievementCheck, unlockAchievement } from "@/lib/achievements";

interface MatrixChallengeProps {
  onBack: () => void;
}

interface Challenge {
  blockIndex: number;    // which 5-digit block (0-based)
  shownDigits: string;   // the 5 digits shown
  beforeDigits: string;  // 5 digits BEFORE
  afterDigits: string;   // 5 digits AFTER
}

type Phase = "before" | "after" | "result";

const TOTAL_CHALLENGES = 50;

export default function MatrixChallenge({ onBack }: MatrixChallengeProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("before");
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [done, setDone] = useState(false);
  const [lastResult, setLastResult] = useState<"correct" | "error" | null>(null);
  const [lastDigit, setLastDigit] = useState<string | null>(null);
  const [showCorrect, setShowCorrect] = useState<string | null>(null);
  const startTime = useRef(0);
  const challengeStart = useRef(0);
  const settings = appState.settings;
  const isCalculatorLayout = settings.numpadLayout === "calculator";

  // Generate challenges on mount
  useEffect(() => {
    const state = loadState();
    const maxBlock = Math.floor(state.learnedChunkCount) - 2; // need before and after
    if (maxBlock < 2) {
      // Not enough chunks learned
      setDone(true);
      return;
    }

    const generated: Challenge[] = [];
    const usedBlocks = new Set<number>();

    while (generated.length < Math.min(TOTAL_CHALLENGES, maxBlock)) {
      const blockIdx = Math.floor(Math.random() * (maxBlock - 1)) + 1; // avoid first and last
      if (usedBlocks.has(blockIdx)) continue;
      usedBlocks.add(blockIdx);

      const shown = getPiDigits(blockIdx * 5, 5);
      const before = getPiDigits((blockIdx - 1) * 5, 5);
      const after = getPiDigits((blockIdx + 1) * 5, 5);

      if (shown.length === 5 && before.length === 5 && after.length === 5) {
        generated.push({
          blockIndex: blockIdx,
          shownDigits: shown,
          beforeDigits: before,
          afterDigits: after,
        });
      }
    }

    setChallenges(generated);
    startTime.current = performance.now();
    challengeStart.current = performance.now();
  }, []);

  const current = challenges[currentIdx];

  const advancePhaseOrChallenge = useCallback(
    (correct: boolean) => {
      if (correct) {
        if (phase === "before") {
          // Move to "after" phase
          setPhase("after");
          setInput("");
          setShowCorrect(null);
          challengeStart.current = performance.now();
        } else {
          // Completed this challenge
          setScore((s) => s + 1);
          const elapsed = performance.now() - startTime.current;
          setTotalTime(elapsed);

          if (currentIdx + 1 >= challenges.length) {
            playSuccessTone();
            vibrateSuccess();
            // Award XP and check for perfect
            setAppState(prev => {
              let next = { ...prev };
              const [withXP] = addXP(next, (score + 1) * 20, settings.soundEnabled, settings.hapticsEnabled);
              next = withXP;
              // Check for perfect matrix
              if (score + 1 === challenges.length) {
                next = unlockAchievement(next, "matrix_perfect");
              }
              const [withAch] = applyAchievementCheck(next);
              next = withAch;
              saveState(next);
              return next;
            });
            setDone(true);
          } else {
            setCurrentIdx((i) => i + 1);
            setPhase("before");
            setInput("");
            setShowCorrect(null);
            challengeStart.current = performance.now();
          }
        }
      } else {
        // Wrong — show correct answer, move to next
        const expected = phase === "before" ? current.beforeDigits : current.afterDigits;
        setShowCorrect(expected);
        setTimeout(() => {
          if (currentIdx + 1 >= challenges.length) {
            setTotalTime(performance.now() - startTime.current);
            setDone(true);
          } else {
            setCurrentIdx((i) => i + 1);
            setPhase("before");
            setInput("");
            setShowCorrect(null);
            challengeStart.current = performance.now();
          }
        }, 1200);
      }
    },
    [phase, currentIdx, challenges.length, current]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (done || !current || showCorrect) return;

      const expected = phase === "before" ? current.beforeDigits : current.afterDigits;
      const pos = input.length;

      if (digit === expected[pos]) {
        if (settings.soundEnabled) playTone(digit);
        if (settings.hapticsEnabled) vibrateLight();
        setLastResult("correct");
        setLastDigit(digit);

        const newInput = input + digit;
        setInput(newInput);

        if (newInput.length === 5) {
          if (settings.soundEnabled) playSuccessTone();
          if (settings.hapticsEnabled) vibrateSuccess();
          setTimeout(() => advancePhaseOrChallenge(true), 200);
        }
      } else {
        if (settings.soundEnabled) playErrorTone();
        if (settings.hapticsEnabled) vibrateError();
        setLastResult("error");
        setLastDigit(digit);
        // Record confusion
        setAppState(prev => {
          const next = recordConfusion(prev, expected[pos], digit);
          saveState(next);
          return next;
        });
        advancePhaseOrChallenge(false);
      }

      setTimeout(() => {
        setLastResult(null);
        setLastDigit(null);
      }, 150);
    },
    [done, current, phase, input, showCorrect, advancePhaseOrChallenge, settings]
  );

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, onBack]);

  if (done) {
    const totalSecs = Math.round(totalTime / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const accuracy = challenges.length > 0 ? ((score / challenges.length) * 100).toFixed(1) : "0";

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
        <div className="text-center space-y-4 fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
          <div className="text-4xl">⚔️</div>
          <p className="text-lg font-bold text-foreground">Matrix Challenge Complete</p>
          {challenges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Learn at least 3 chunks first to use Matrix Challenge.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {score}/{challenges.length}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">score</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{accuracy}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase">accuracy</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {mins}:{secs.toString().padStart(2, "0")}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">time</div>
                </div>
              </div>
            </>
          )}
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

  if (!current) return null;

  const expected = phase === "before" ? current.beforeDigits : current.afterDigits;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          matrix challenge · {currentIdx + 1}/{challenges.length}
        </p>
      </header>

      <div className="flex-1 flex items-center">
        <div className="text-center space-y-4 w-full">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">
            {phase === "before" ? "Type the 5 digits BEFORE" : "Type the 5 digits AFTER"}
          </div>

          {/* Show the reference block */}
          <div className="space-y-2">
            {phase === "before" && (
              <div className="font-mono text-2xl tracking-[0.3em] text-muted-foreground/30">
                {input.padEnd(5, "·").split("").map((d, i) => (
                  <span key={i} className={d !== "·" ? "text-primary font-bold" : ""}>
                    {d}
                  </span>
                ))}
              </div>
            )}
            <div className="font-mono text-4xl tracking-[0.4em] text-primary font-bold">
              {current.shownDigits}
            </div>
            {phase === "after" && (
              <div className="font-mono text-2xl tracking-[0.3em] text-muted-foreground/30">
                {input.padEnd(5, "·").split("").map((d, i) => (
                  <span key={i} className={d !== "·" ? "text-primary font-bold" : ""}>
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {showCorrect && (
            <div className="text-sm text-destructive fade-in">
              ✗ Correct was: <span className="font-mono font-bold">{showCorrect}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            block {current.blockIndex + 1} · digits {current.blockIndex * 5 + 1}–
            {current.blockIndex * 5 + 5}
          </div>
        </div>
      </div>

      <div className="w-full mb-4">
        <div className="flex justify-center gap-6 text-center">
          <StatCell label="score" value={`${score}/${currentIdx}`} />
          <StatCell label="phase" value={phase === "before" ? "BEFORE" : "AFTER"} />
          <StatCell label="remaining" value={(challenges.length - currentIdx).toString()} />
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
          end challenge
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
