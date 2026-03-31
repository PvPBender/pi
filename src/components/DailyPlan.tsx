import { useMemo } from "react";
import { type AppState, getChunkArray } from "@/lib/storage";

interface DailyPlanProps {
  state: AppState;
  onNavigate: (mode: string) => void;
}

interface PlanItem {
  icon: string;
  label: string;
  detail: string;
  timeMin: number;
  mode: string;
}

export default function DailyPlan({ state, onNavigate }: DailyPlanProps) {
  const plan = useMemo(() => {
    const items: PlanItem[] = [];
    const now = Date.now();
    const chunkArr = getChunkArray(state);

    // Count due reviews
    const dueCount = chunkArr.filter(
      (c) => c.chunkIndex < state.learnedChunkCount && (c.nextReview <= now || c.totalReviews === 0)
    ).length;
    // Count untracked learned chunks
    const trackedChunks = new Set(chunkArr.map((c) => c.chunkIndex));
    let untrackedDue = 0;
    for (let i = 0; i < state.learnedChunkCount; i++) {
      if (!trackedChunks.has(i)) untrackedDue++;
    }
    const totalDue = dueCount + untrackedDue;

    if (totalDue > 0) {
      const estMin = Math.max(1, Math.round(totalDue * 0.5));
      items.push({
        icon: "🔄",
        label: `Review ${totalDue} due chunks`,
        detail: `~${estMin} min`,
        timeMin: estMin,
        mode: "review",
      });
    }

    // Weak chunks
    const weakCount = state.weakChunks.length;
    if (weakCount > 0) {
      const drillCount = Math.min(weakCount, 10);
      const estMin = Math.max(1, Math.round(drillCount * 0.5));
      items.push({
        icon: "🎯",
        label: `Drill ${drillCount} weak spots`,
        detail: `~${estMin} min`,
        timeMin: estMin,
        mode: "weakspots",
      });
    }

    // New chunks to learn
    const dailyRemaining = Math.max(0, state.settings.dailyGoal - state.todayDigitsLearned);
    if (dailyRemaining > 0) {
      const newChunks = Math.ceil(dailyRemaining / state.settings.chunkSize);
      const estMin = Math.max(1, Math.round(newChunks * 1));
      items.push({
        icon: "📚",
        label: `Learn ${newChunks} new chunks`,
        detail: `~${estMin} min`,
        timeMin: estMin,
        mode: "learn",
      });
    }

    // Speed drill if have enough chunks
    if (state.learnedChunkCount >= 5) {
      items.push({
        icon: "⚡",
        label: "Speed drill 20 chunks",
        detail: "~5 min",
        timeMin: 5,
        mode: "speed",
      });
    }

    return items;
  }, [state]);

  const totalMin = plan.reduce((s, p) => s + p.timeMin, 0);

  if (plan.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-muted/20 border border-border rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          📋 Today's Plan
        </div>
        <div className="text-[10px] text-muted-foreground">~{totalMin} min</div>
      </div>

      <div className="space-y-1">
        {plan.map((item, i) => (
          <button
            key={i}
            onClick={() => onNavigate(item.mode)}
            className="w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded hover:bg-muted/30 transition-colors group"
          >
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground/40 text-[10px]">
                {i === plan.length - 1 ? "└──" : "├──"}
              </span>
              <span>{item.icon}</span>
              <span className="text-foreground group-hover:text-primary transition-colors">
                {item.label}
              </span>
            </span>
            <span className="text-muted-foreground/60">{item.detail}</span>
          </button>
        ))}
      </div>

      {state.currentDayStreak > 0 && (
        <div className="text-[10px] text-primary text-center">
          🔥 Don't break your {state.currentDayStreak}-day streak!
        </div>
      )}
    </div>
  );
}
