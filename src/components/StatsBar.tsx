interface StatsBarProps {
  bestDigit: number;
  currentStreak: number;
  avgLatency: number | null;
  errors: number;
  todayLearned: number;
  dailyGoal: number;
}

export default function StatsBar({
  bestDigit,
  currentStreak,
  avgLatency,
  errors,
  todayLearned,
  dailyGoal,
}: StatsBarProps) {
  const goalProgress = Math.min(1, todayLearned / dailyGoal);

  return (
    <div className="space-y-3 w-full max-w-[320px] mx-auto">
      {/* Daily goal bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>today</span>
          <span>
            {todayLearned}/{dailyGoal}
          </span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${goalProgress * 100}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="best" value={bestDigit.toString()} />
        <Stat label="streak" value={currentStreak.toString()} />
        <Stat
          label="ms"
          value={avgLatency ? Math.round(avgLatency).toString() : "—"}
          color={
            avgLatency
              ? avgLatency < 400
                ? "text-success"
                : avgLatency < 800
                ? "text-primary"
                : "text-destructive"
              : undefined
          }
        />
        <Stat label="errors" value={errors.toString()} color={errors > 0 ? "text-destructive" : undefined} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className={`text-lg font-bold ${color || "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
