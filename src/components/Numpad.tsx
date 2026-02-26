import { useCallback } from "react";

interface NumpadProps {
  onDigit: (digit: string) => void;
  lastResult: "correct" | "error" | null;
  lastDigit: string | null;
  disabled?: boolean;
}

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [null, "0", null],
];

export default function Numpad({ onDigit, lastResult, lastDigit, disabled }: NumpadProps) {
  const handleClick = useCallback(
    (digit: string) => {
      if (!disabled) onDigit(digit);
    },
    [onDigit, disabled]
  );

  return (
    <div className="grid gap-2 w-full max-w-[280px] mx-auto select-none">
      {ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-2">
          {row.map((digit, ci) =>
            digit === null ? (
              <div key={ci} />
            ) : (
              <button
                key={digit}
                onPointerDown={() => handleClick(digit)}
                disabled={disabled}
                className={`
                  aspect-square rounded-lg border text-xl font-semibold
                  transition-all duration-75 active:scale-95
                  flex items-center justify-center
                  ${
                    lastDigit === digit && lastResult === "correct"
                      ? "bg-key-active text-primary-foreground key-glow-active border-primary"
                      : lastDigit === digit && lastResult === "error"
                      ? "bg-destructive/20 text-destructive key-glow-error border-destructive"
                      : "bg-key border-key-border text-foreground hover:bg-key-hover key-glow"
                  }
                  ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                {digit}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}
