// Theme system — applies CSS custom properties to :root

export interface ThemeColors {
  bg: string;
  surface: string;
  primary: string;
  text: string;
  muted: string;
  error: string;
  success: string;
}

export const THEMES: Record<string, ThemeColors> = {
  dark: {
    bg: "#0a0a0a",
    surface: "#1a1a1a",
    primary: "#f59e0b",
    text: "#fafafa",
    muted: "#71717a",
    error: "#ef4444",
    success: "#22c55e",
  },
  amoled: {
    bg: "#000000",
    surface: "#0a0a0a",
    primary: "#f59e0b",
    text: "#fafafa",
    muted: "#52525b",
    error: "#ef4444",
    success: "#22c55e",
  },
  light: {
    bg: "#fafafa",
    surface: "#f4f4f5",
    primary: "#d97706",
    text: "#18181b",
    muted: "#a1a1aa",
    error: "#dc2626",
    success: "#16a34a",
  },
  hacker: {
    bg: "#0a0a0a",
    surface: "#0f1a0f",
    primary: "#00ff41",
    text: "#00ff41",
    muted: "#2d5a2d",
    error: "#ff0040",
    success: "#00ff41",
  },
};

export type ThemeName = keyof typeof THEMES;

// Convert hex to HSL values for CSS custom properties
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslString(hex: string): string {
  const { h, s, l } = hexToHSL(hex);
  return `${h} ${s}% ${l}%`;
}

export function applyTheme(themeName: string): void {
  const theme = THEMES[themeName] || THEMES.dark;
  const root = document.documentElement;

  // Core colors
  root.style.setProperty("--background", hslString(theme.bg));
  root.style.setProperty("--foreground", hslString(theme.text));
  root.style.setProperty("--card", hslString(theme.surface));
  root.style.setProperty("--card-foreground", hslString(theme.text));
  root.style.setProperty("--popover", hslString(theme.surface));
  root.style.setProperty("--popover-foreground", hslString(theme.text));
  root.style.setProperty("--primary", hslString(theme.primary));
  root.style.setProperty("--accent", hslString(theme.primary));
  root.style.setProperty("--muted", hslString(theme.surface));
  root.style.setProperty("--muted-foreground", hslString(theme.muted));
  root.style.setProperty("--destructive", hslString(theme.error));
  root.style.setProperty("--success", hslString(theme.success));
  root.style.setProperty("--border", hslString(theme.surface));
  root.style.setProperty("--input", hslString(theme.surface));
  root.style.setProperty("--ring", hslString(theme.primary));

  // Key colors
  root.style.setProperty("--key-bg", hslString(theme.surface));
  root.style.setProperty("--key-bg-hover", hslString(theme.surface));
  root.style.setProperty("--key-bg-active", hslString(theme.primary));
  root.style.setProperty("--key-border", hslString(theme.surface));
  root.style.setProperty("--key-glow", hslString(theme.primary));

  // For primary-foreground, use the bg color (works for dark and light)
  root.style.setProperty("--primary-foreground", hslString(theme.bg));
  root.style.setProperty("--accent-foreground", hslString(theme.bg));

  // Secondary
  root.style.setProperty("--secondary", hslString(theme.surface));
  root.style.setProperty("--secondary-foreground", hslString(theme.muted));
}

export function getThemeNames(): string[] {
  return Object.keys(THEMES);
}

export function getThemeLabel(name: string): string {
  switch (name) {
    case "dark": return "Dark";
    case "amoled": return "AMOLED";
    case "light": return "Light";
    case "hacker": return "Hacker";
    default: return name;
  }
}
