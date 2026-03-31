import { useState, useCallback } from "react";
import { loadState, saveState, type AppState, type AppSettings } from "@/lib/storage";
import { THEMES, applyTheme, getThemeNames, getThemeLabel } from "@/lib/themes";
import { setTTSEnabled, setTTSSpeed, isTTSAvailable } from "@/lib/tts";

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const settings = appState.settings;

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setAppState((prev) => {
      const next = {
        ...prev,
        settings: { ...prev.settings, ...patch },
      };
      // Keep top-level fields in sync
      if (patch.numpadLayout) next.numpadLayout = patch.numpadLayout;
      if (patch.dailyGoal) next.dailyGoal = patch.dailyGoal;
      // Apply theme immediately
      if (patch.theme) {
        applyTheme(patch.theme);
      }
      // Apply TTS settings
      if (patch.ttsEnabled !== undefined) {
        setTTSEnabled(patch.ttsEnabled);
      }
      if (patch.ttsSpeed !== undefined) {
        setTTSSpeed(patch.ttsSpeed);
      }
      saveState(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    const fresh: AppState = {
      bestDigit: 0,
      sessions: [],
      dailyGoal: settings.dailyGoal,
      todayDigitsLearned: 0,
      todayDate: new Date().toISOString().slice(0, 10),
      chunks: {},
      learnedChunkCount: 0,
      numpadLayout: settings.numpadLayout,
      dailyHistory: [],
      settings: { ...settings },
      currentDayStreak: 0,
      lastPracticeDate: "",
      weakChunks: [],
      confusionData: {},
      achievements: [],
      xp: 0,
      level: 1,
    };
    saveState(fresh);
    setAppState(fresh);
    setShowResetConfirm(false);
  }, [settings]);

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 max-w-md mx-auto">
      <header className="text-center space-y-1 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-amber">π</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">settings</p>
      </header>

      <div className="w-full space-y-5 flex-1">
        {/* Theme */}
        <SettingRow label="Theme" description="Visual theme">
          <div className="grid grid-cols-4 gap-2">
            {getThemeNames().map((name) => {
              const t = THEMES[name];
              const isActive = settings.theme === name;
              return (
                <button
                  key={name}
                  onClick={() => updateSettings({ theme: name })}
                  className={`relative rounded-lg border-2 p-1.5 transition-all ${
                    isActive ? "border-primary" : "border-border hover:border-muted-foreground"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full h-6 rounded-sm flex gap-[2px] overflow-hidden">
                      <div className="flex-1" style={{ backgroundColor: t.bg }} />
                      <div className="flex-1" style={{ backgroundColor: t.surface }} />
                      <div className="flex-1" style={{ backgroundColor: t.primary }} />
                    </div>
                    <span className={`text-[9px] ${isActive ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {getThemeLabel(name)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </SettingRow>

        {/* Chunk Size */}
        <SettingRow label="Chunk Size" description="Digits per chunk in Learn mode">
          <div className="flex gap-2">
            {([5, 10] as const).map((size) => (
              <button
                key={size}
                onClick={() => updateSettings({ chunkSize: size })}
                className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
                  settings.chunkSize === size
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </SettingRow>

        {/* Review Batch Size */}
        <SettingRow
          label="Review Batch Size"
          description={`${settings.reviewBatchSize} chunks per review session`}
        >
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.reviewBatchSize}
            onChange={(e) => updateSettings({ reviewBatchSize: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </SettingRow>

        {/* Daily Goal */}
        <SettingRow
          label="Daily Goal"
          description={`${settings.dailyGoal} digits per day`}
        >
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={settings.dailyGoal}
            onChange={(e) => updateSettings({ dailyGoal: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </SettingRow>

        {/* Target Speed */}
        <SettingRow
          label="Target Speed"
          description={`${settings.targetSpeed}ms per digit for speed drills`}
        >
          <input
            type="range"
            min={100}
            max={1000}
            step={50}
            value={settings.targetSpeed}
            onChange={(e) => updateSettings({ targetSpeed: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </SettingRow>

        {/* Numpad Layout */}
        <SettingRow label="Numpad Layout">
          <div className="flex gap-2">
            <button
              onClick={() => updateSettings({ numpadLayout: "phone" })}
              className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
                settings.numpadLayout === "phone"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              123↑
            </button>
            <button
              onClick={() => updateSettings({ numpadLayout: "calculator" })}
              className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
                settings.numpadLayout === "calculator"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              789↑
            </button>
          </div>
        </SettingRow>

        {/* Sound */}
        <SettingRow label="Sound">
          <ToggleButton
            active={settings.soundEnabled}
            onToggle={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          />
        </SettingRow>

        {/* Haptics */}
        <SettingRow label="Haptics">
          <ToggleButton
            active={settings.hapticsEnabled}
            onToggle={() => updateSettings({ hapticsEnabled: !settings.hapticsEnabled })}
          />
        </SettingRow>

        {/* TTS */}
        {isTTSAvailable() && (
          <>
            <SettingRow label="Text-to-Speech" description="Read digits aloud">
              <ToggleButton
                active={settings.ttsEnabled}
                onToggle={() => updateSettings({ ttsEnabled: !settings.ttsEnabled })}
              />
            </SettingRow>

            {settings.ttsEnabled && (
              <SettingRow
                label="TTS Speed"
                description={`${settings.ttsSpeed.toFixed(1)}x`}
              >
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={settings.ttsSpeed}
                  onChange={(e) => updateSettings({ ttsSpeed: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
              </SettingRow>
            )}
          </>
        )}

        {/* Reset Progress */}
        <div className="pt-4 border-t border-border">
          {showResetConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive font-semibold">
                This will delete ALL progress. Are you sure?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={resetProgress}
                  className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-semibold text-sm"
                >
                  YES, RESET
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg font-semibold text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full px-4 py-2 bg-muted text-destructive rounded-lg font-semibold text-sm hover:bg-destructive/20 transition-colors"
            >
              Reset All Progress
            </button>
          )}
        </div>

        {/* Version */}
        <div className="text-center text-[10px] text-muted-foreground/40 pt-2">
          π Trainer v3.0.0
        </div>
      </div>

      <button
        onClick={onBack}
        className="mt-6 px-5 py-3 bg-muted text-foreground rounded-lg font-semibold text-sm"
      >
        BACK
      </button>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          {description && (
            <div className="text-[10px] text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-12 h-6 rounded-full transition-colors relative ${
        active ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
          active ? "translate-x-6" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
