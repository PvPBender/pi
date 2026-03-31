import { type AppState } from "@/lib/storage";

interface ConfusionMatrixProps {
  state: AppState;
}

export default function ConfusionMatrix({ state }: ConfusionMatrixProps) {
  const data = state.confusionData;
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

  // Find max count for color scaling
  let maxCount = 0;
  for (const expected of digits) {
    for (const typed of digits) {
      if (expected === typed) continue;
      const count = data[expected]?.[typed] || 0;
      if (count > maxCount) maxCount = count;
    }
  }

  const totalErrors = Object.values(data).reduce(
    (sum, inner) => sum + Object.values(inner).reduce((s, c) => s + c, 0), 0
  );

  if (totalErrors === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-4">
        No confusion data yet. Make some mistakes first! 😄
      </div>
    );
  }

  const getColor = (count: number): string => {
    if (count === 0) return "bg-muted/10";
    const intensity = Math.min(1, count / Math.max(maxCount, 1));
    if (intensity > 0.7) return "bg-red-500/80";
    if (intensity > 0.4) return "bg-red-500/50";
    if (intensity > 0.2) return "bg-red-500/30";
    return "bg-red-500/15";
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground text-center">
        {totalErrors} total confusions tracked
      </div>

      {/* Column headers */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex items-center gap-[2px]">
            <div className="w-6 h-6 flex items-center justify-center text-[8px] text-muted-foreground">
              E↓T→
            </div>
            {digits.map(d => (
              <div key={d} className="w-6 h-6 flex items-center justify-center text-[10px] font-mono text-muted-foreground font-bold">
                {d}
              </div>
            ))}
          </div>

          {/* Rows */}
          {digits.map(expected => (
            <div key={expected} className="flex items-center gap-[2px]">
              <div className="w-6 h-6 flex items-center justify-center text-[10px] font-mono text-muted-foreground font-bold">
                {expected}
              </div>
              {digits.map(typed => {
                const isDiagonal = expected === typed;
                const count = isDiagonal ? 0 : (data[expected]?.[typed] || 0);
                return (
                  <div
                    key={typed}
                    className={`w-6 h-6 flex items-center justify-center text-[8px] font-mono rounded-sm ${
                      isDiagonal ? "bg-muted/5" : getColor(count)
                    } ${count > 0 ? "text-foreground" : "text-transparent"}`}
                    title={isDiagonal ? "" : `Expected ${expected}, typed ${typed}: ${count}`}
                  >
                    {count > 0 ? count : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[9px] text-muted-foreground/50 text-center">
        Rows = expected digit · Columns = typed digit
      </div>
    </div>
  );
}
