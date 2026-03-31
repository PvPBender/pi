import { type AppState } from "@/lib/storage";

interface SessionHistoryProps {
  state: AppState;
  onBack: () => void;
}

export default function SessionHistory({ state, onBack }: SessionHistoryProps) {
  const sessions = [...state.sessions].reverse();

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    if (mins > 0) return `${mins}m ${remainSecs}s`;
    return `${secs}s`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          session history
        </p>
      </header>

      <div className="w-full flex-1 overflow-y-auto space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center mt-8">
            No sessions recorded yet.
          </p>
        ) : (
          sessions.map((s, i) => (
            <div
              key={i}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground text-xs">
                  {formatDate(s.date)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(s.durationMs)}
                </span>
              </div>
              <div className="flex gap-4 text-xs">
                <span>
                  <span className="text-primary font-bold">{s.digitsReached}</span>{" "}
                  <span className="text-muted-foreground">digits</span>
                </span>
                <span>
                  <span className="font-bold">{Math.round(s.avgLatencyMs)}</span>{" "}
                  <span className="text-muted-foreground">ms avg</span>
                </span>
                <span>
                  <span className={s.errors > 0 ? "text-destructive font-bold" : "font-bold"}>
                    {s.errors}
                  </span>{" "}
                  <span className="text-muted-foreground">errors</span>
                </span>
              </div>
            </div>
          ))
        )}
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
