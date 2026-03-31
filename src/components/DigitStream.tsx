import { getPiDigits } from "@/lib/pi";
import { useRef, useEffect, useMemo } from "react";
import { loadState, getChunkState } from "@/lib/storage";

interface DigitStreamProps {
  currentIndex: number;
  showUpcoming: boolean;
  chunkSize?: number;
  highlightRange?: { start: number; end: number };
  showMasteryColors?: boolean;
  showRowNumbers?: boolean;
}

export default function DigitStream({
  currentIndex,
  showUpcoming,
  chunkSize = 5,
  highlightRange,
  showMasteryColors = false,
  showRowNumbers = false,
}: DigitStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeGroupRef = useRef<HTMLSpanElement>(null);

  // Which group the current index falls in
  const currentGroup = Math.floor(currentIndex / chunkSize);

  // Show a range of groups around the current one
  const groupsBefore = 2;
  const groupsAfter = 3;
  const startGroup = Math.max(0, currentGroup - groupsBefore);
  const endGroup = currentGroup + groupsAfter;

  // Mastery data for coloring
  const masteryMap = useMemo(() => {
    if (!showMasteryColors) return null;
    const state = loadState();
    const map = new Map<number, number>();
    for (let g = startGroup; g <= endGroup; g++) {
      const cs = getChunkState(state, g);
      if (g < state.learnedChunkCount) {
        if (cs.correctStreak >= 5) map.set(g, 4);
        else if (cs.correctStreak >= 3) map.set(g, 3);
        else if (cs.totalReviews > 1) map.set(g, 2);
        else map.set(g, 1);
      } else {
        map.set(g, 0);
      }
    }
    return map;
  }, [showMasteryColors, startGroup, endGroup]);

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
    const start = g * chunkSize;
    const digits = getPiDigits(start, chunkSize);
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

  const getMasteryBorder = (groupIndex: number): string => {
    if (!masteryMap) return "";
    const level = masteryMap.get(groupIndex) ?? 0;
    switch (level) {
      case 4: return "border-l-2 border-l-green-500/50";
      case 3: return "border-l-2 border-l-yellow-500/50";
      case 2: return "border-l-2 border-l-orange-500/50";
      case 1: return "border-l-2 border-l-red-500/50";
      default: return "";
    }
  };

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
          <div key={ri} className="flex justify-center gap-3 mb-1 items-center">
            {/* Row number */}
            {showRowNumbers && row[0] && (
              <span className="text-[8px] text-muted-foreground/30 w-6 text-right shrink-0 font-mono">
                {(row[0].groupIndex * chunkSize + 1).toString()}
              </span>
            )}
            {row.map(({ groupIndex, digits }) => {
              const isActive = groupIndex === currentGroup;
              const isPast = groupIndex < currentGroup;
              const isEven = groupIndex % 2 === 0;

              const inHighlight = highlightRange
                ? groupIndex * chunkSize >= highlightRange.start &&
                  groupIndex * chunkSize < highlightRange.end
                : false;

              return (
                <span
                  key={groupIndex}
                  ref={isActive ? activeGroupRef : undefined}
                  className={`
                    inline-flex tracking-[0.2em] px-1.5 py-0.5 rounded text-sm
                    transition-all duration-200
                    ${getMasteryBorder(groupIndex)}
                    ${inHighlight ? "ring-1 ring-amber-400/40" : ""}
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
                    const absIndex = groupIndex * chunkSize + di;
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
