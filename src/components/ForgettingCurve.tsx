import { useMemo } from "react";
import { type ChunkState } from "@/lib/storage";

interface ForgettingCurveProps {
  chunk: ChunkState;
  onClose: () => void;
}

export default function ForgettingCurve({ chunk, onClose }: ForgettingCurveProps) {
  const curveData = useMemo(() => {
    const points: { day: number; recall: number }[] = [];
    const interval = Math.max(chunk.interval, 1);
    const easeFactor = chunk.easeFactor || 2.5;

    // Generate curve from 0 to interval * 3 days
    const maxDays = Math.max(interval * 3, 14);
    const steps = 50;

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxDays;
      // P(recall) = e^(-t / (interval * easeFactor))
      const recall = Math.exp(-t / (interval * easeFactor));
      points.push({ day: t, recall });
    }

    return { points, maxDays, interval, easeFactor };
  }, [chunk]);

  const stats = useMemo(() => {
    const accuracy = chunk.totalReviews > 0
      ? ((chunk.totalCorrect / chunk.totalReviews) * 100).toFixed(0)
      : "—";
    const daysSinceReview = chunk.nextReview > 0
      ? Math.max(0, (Date.now() - (chunk.nextReview - chunk.interval * 86400000)) / 86400000).toFixed(1)
      : "—";
    const isDue = chunk.nextReview <= Date.now();

    return { accuracy, daysSinceReview, isDue };
  }, [chunk]);

  const { points, maxDays, interval } = curveData;

  // SVG chart dimensions
  const W = 300;
  const H = 150;
  const PAD = 25;
  const chartW = W - PAD * 2;
  const chartH = H - PAD * 2;

  const toX = (day: number) => PAD + (day / maxDays) * chartW;
  const toY = (recall: number) => PAD + (1 - recall) * chartH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.day).toFixed(1)} ${toY(p.recall).toFixed(1)}`)
    .join(" ");

  // Ideal review line
  const reviewX = toX(interval);

  // Current position
  const daysSince = parseFloat(stats.daysSinceReview);
  const currentRecall = !isNaN(daysSince)
    ? Math.exp(-daysSince / (interval * chunk.easeFactor))
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
      <div className="text-center space-y-4 fade-in w-full">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          Forgetting Curve · Chunk {chunk.chunkIndex + 1}
        </p>

        {/* SVG Chart */}
        <div className="w-full flex justify-center">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full max-w-[320px]"
            style={{ aspectRatio: `${W}/${H}` }}
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <line
                key={v}
                x1={PAD} y1={toY(v)} x2={W - PAD} y2={toY(v)}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.15}
                strokeDasharray={v === 0 || v === 1 ? "none" : "2,2"}
              />
            ))}

            {/* Ideal review line */}
            <line
              x1={reviewX} y1={PAD} x2={reviewX} y2={H - PAD}
              stroke="hsl(var(--success))"
              strokeOpacity={0.4}
              strokeDasharray="4,3"
            />
            <text
              x={reviewX} y={PAD - 5}
              fill="hsl(var(--success))"
              fontSize="7"
              textAnchor="middle"
              opacity={0.6}
            >
              review
            </text>

            {/* Curve */}
            <path
              d={pathD}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeLinecap="round"
            />

            {/* Current position dot */}
            {currentRecall !== null && !isNaN(daysSince) && (
              <circle
                cx={toX(daysSince)}
                cy={toY(currentRecall)}
                r={4}
                fill={stats.isDue ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
              />
            )}

            {/* Y axis labels */}
            {[0, 50, 100].map(v => (
              <text
                key={v}
                x={PAD - 3} y={toY(v / 100) + 3}
                fill="hsl(var(--muted-foreground))"
                fontSize="7"
                textAnchor="end"
                opacity={0.5}
              >
                {v}%
              </text>
            ))}

            {/* X axis label */}
            <text
              x={W / 2} y={H - 3}
              fill="hsl(var(--muted-foreground))"
              fontSize="7"
              textAnchor="middle"
              opacity={0.5}
            >
              days since review
            </text>
          </svg>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-foreground">{chunk.totalReviews}</div>
            <div className="text-[10px] text-muted-foreground uppercase">reviews</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{stats.accuracy}%</div>
            <div className="text-[10px] text-muted-foreground uppercase">accuracy</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{chunk.interval}d</div>
            <div className="text-[10px] text-muted-foreground uppercase">interval</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{chunk.easeFactor.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground uppercase">ease</div>
          </div>
        </div>

        <div className={`text-xs px-3 py-1 rounded ${stats.isDue ? "bg-destructive/20 text-destructive" : "bg-green-900/20 text-green-400"}`}>
          {stats.isDue ? "⚠️ Due for review!" : `✓ Next review in ${Math.max(0, Math.ceil((chunk.nextReview - Date.now()) / 86400000))} days`}
        </div>

        <button
          onClick={onClose}
          className="px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
