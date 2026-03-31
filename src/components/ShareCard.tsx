import { useRef, useCallback, useEffect } from "react";
import { type AppState } from "@/lib/storage";
import { getLevelForXP } from "@/lib/xp";

interface ShareCardProps {
  state: AppState;
  onClose: () => void;
}

export default function ShareCard({ state, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const level = getLevelForXP(state.xp);

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 600;
    const h = 400;
    canvas.width = w;
    canvas.height = h;

    // Dark background with gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0a0a0a");
    grad.addColorStop(1, "#1a1a2e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = "#f59e0b33";
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Pi symbol
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 72px serif";
    ctx.textAlign = "center";
    ctx.fillText("π", w / 2, 90);

    // Main headline
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`I memorized ${state.bestDigit.toLocaleString()} digits of π`, w / 2, 150);

    // Level
    ctx.fillStyle = "#f59e0b";
    ctx.font = "18px sans-serif";
    ctx.fillText(`Level ${level.level} — ${level.name}`, w / 2, 190);

    // Stats row
    ctx.fillStyle = "#888888";
    ctx.font = "14px sans-serif";
    const stats = [
      `${state.xp.toLocaleString()} XP`,
      `${state.currentDayStreak} day streak`,
      `${state.achievements.length} achievements`,
    ];
    ctx.fillText(stats.join("  ·  "), w / 2, 230);

    // Learned chunks
    ctx.fillStyle = "#666666";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${state.learnedChunkCount} chunks learned · ${state.sessions.length} sessions`, w / 2, 260);

    // Footer
    ctx.fillStyle = "#333333";
    ctx.font = "11px sans-serif";
    ctx.fillText("π Memorization Trainer", w / 2, h - 30);
  }, [state, level]);

  const handleSave = useCallback(() => {
    drawCard();
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pi-stats-${state.bestDigit}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [drawCard, state.bestDigit]);

  // Draw on mount
  useEffect(() => { drawCard(); }, [drawCard]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">share card</p>
      </header>

      <div className="w-full overflow-hidden rounded-lg border border-border mb-4">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ aspectRatio: "3/2" }}
        />
      </div>

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={handleSave}
          className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
        >
          📥 Save PNG
        </button>
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
        >
          BACK
        </button>
      </div>
    </div>
  );
}
