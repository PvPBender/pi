import { getPiDigits } from "@/lib/pi";

interface DigitStreamProps {
  currentIndex: number;
  showUpcoming: boolean;
}

export default function DigitStream({ currentIndex, showUpcoming }: DigitStreamProps) {
  // Show a window of digits around current position
  const windowSize = 20;
  const start = Math.max(0, currentIndex - 10);
  const digits = getPiDigits(start, windowSize);

  return (
    <div className="text-center space-y-2">
      <div className="text-muted-foreground text-xs tracking-widest uppercase">
        digit {currentIndex + 1}
      </div>
      <div className="font-mono text-lg tracking-[0.3em] leading-relaxed overflow-hidden">
        <span className="text-muted-foreground">3.</span>
        {digits.split("").map((d, i) => {
          const absIndex = start + i;
          return (
            <span
              key={absIndex}
              className={
                absIndex < currentIndex
                  ? "text-muted-foreground/50"
                  : absIndex === currentIndex
                  ? "text-primary font-bold text-2xl"
                  : showUpcoming
                  ? "text-muted-foreground/40"
                  : "text-muted-foreground/20"
              }
            >
              {absIndex < currentIndex
                ? d
                : absIndex === currentIndex
                ? "?"
                : showUpcoming
                ? d
                : "·"}
            </span>
          );
        })}
      </div>
    </div>
  );
}
