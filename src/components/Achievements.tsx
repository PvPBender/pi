import { useState } from "react";
import { loadState, type AppState } from "@/lib/storage";
import { ACHIEVEMENTS } from "@/lib/achievements";

interface AchievementsProps {
  onBack: () => void;
}

export default function Achievements({ onBack }: AchievementsProps) {
  const [state] = useState<AppState>(loadState);
  const unlockedSet = new Set(state.achievements);
  const unlockedCount = state.achievements.length;
  const totalCount = ACHIEVEMENTS.length;

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">achievements</p>
      </header>

      <div className="text-center mb-4">
        <div className="text-2xl font-bold text-primary">{unlockedCount}/{totalCount}</div>
        <div className="text-[10px] text-muted-foreground uppercase">unlocked</div>
      </div>

      <div className="w-full space-y-2 flex-1 overflow-y-auto pb-4">
        {ACHIEVEMENTS.map((ach) => {
          const unlocked = unlockedSet.has(ach.id);
          return (
            <div
              key={ach.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                unlocked
                  ? "bg-muted/30 border-primary/30"
                  : "bg-muted/10 border-border/30 opacity-50"
              }`}
            >
              <div className="text-2xl">{unlocked ? ach.icon : "🔒"}</div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                  {unlocked ? ach.name : "???"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ach.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className="mt-4 px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
      >
        BACK
      </button>
    </div>
  );
}
