import { getPiDigits } from "@/lib/pi";
import { useRef, useEffect } from "react";

interface DigitStreamProps {
  currentIndex: number;
  showUpcoming: boolean;
}

export default function DigitStream({ currentIndex, showUpcoming }: DigitStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeGroupRef = useRef<HTMLSpanElement>(null);

  // Which 5-digit group the current index falls in
  const currentGroup = Math.floor(currentIndex / 5);

  // Show a range of groups around the current one
  const groupsBefore = 2;
  const groupsAfter = 3;
  const startGroup = Math.max(0, currentGroup - groupsBefore);
  const endGroup = currentGroup + groupsAfter;

  // Scroll active group into view
  useEffect(() => {
    if (activeGroupRef.current) {
      activeGroupRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentGroup]);

  const groups: { groupIndex: number; digits: string }[] = [];
  for (let g = startGroup; g <= endGroup; g++) {
    const start = g * 5;
    const digits = getPiDigits(start, 5);
    if (digits.length > 0) {
      groups.push({ groupIndex: g, digits });
    }
  }

  // Split groups into rows of 4
  const rowSize = 4;
  const rows: typeof groups[] = [];
  for (let i = 0; i < groups.length; i += rowSize) {
    rows.push(groups.slice(i, i + rowSize));
  }

  return (
    <div className="text-center space-y-3 w-full">
      <div className="text-muted-foreground text-xs tracking-widest uppercase">
        digit {currentIndex + 1} · group {currentGroup + 1}
      </div>

      <div
        ref={containerRef}
        className="font-mono text-base leading-relaxed overflow-x-auto px-2"
      >
        {/* Show "3." prefix only when viewing from the start */}
        {startGroup === 0 && (
          <div className="text-muted-foreground/50 text-xs mb-1">3.</div>
        )}

        {rows.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-3 mb-1">
            {row.map(({ groupIndex, digits }) => {
              const isActive = groupIndex === currentGroup;
              const isPast = groupIndex < currentGroup;
              const isFuture = groupIndex > currentGroup;
              const isEven = groupIndex % 2 === 0;

              return (
                <span
                  key={groupIndex}
                  ref={isActive ? activeGroupRef : undefined}
                  className={`
                    inline-flex tracking-[0.2em] px-1.5 py-0.5 rounded text-sm
                    transition-all duration-200
                    ${isActive
                      ? "ring-1 ring-primary/50 bg-primary/10 scale-105"
                      : isPast
                      ? isEven
                        ? "bg-muted/30"
                        : "bg-muted/15"
                      : isEven
                      ? "bg-muted/20"
                      : "bg-muted/10"
                    }
                  `}
                >
                  {digits.split("").map((d, di) => {
                    const absIndex = groupIndex * 5 + di;
                    const isCurrent = absIndex === currentIndex;
                    const isTyped = absIndex < currentIndex;
                    const isUpcoming = absIndex > currentIndex;

                    return (
                      <span
                        key={di}
                        className={`
                          ${isCurrent
                            ? "text-primary font-bold text-lg"
                            : isTyped
                            ? "text-muted-foreground/50"
                            : isUpcoming && showUpcoming
                            ? "text-muted-foreground/40"
                            : isUpcoming
                            ? "text-muted-foreground/15"
                            : ""
                          }
                        `}
                      >
                        {isTyped || isCurrent
                          ? isCurrent
                            ? showUpcoming ? d : "?"
                            : d
                          : showUpcoming
                          ? d
                          : "·"}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Group number indicator */}
      <div className="flex justify-center gap-1">
        {groups.map(({ groupIndex }) => (
          <div
            key={groupIndex}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              groupIndex === currentGroup
                ? "bg-primary scale-125"
                : groupIndex < currentGroup
                ? "bg-muted-foreground/30"
                : "bg-muted-foreground/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
