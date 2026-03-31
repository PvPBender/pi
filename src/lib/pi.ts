// Pi digits loader — loads 999,999 decimal digits from static file
// Digits are loaded on-demand and cached in memory

let piDigits: string | null = null;
let loadPromise: Promise<string> | null = null;

export const TOTAL_AVAILABLE_DIGITS = 999_999;

async function fetchDigits(): Promise<string> {
  const res = await fetch("/pi-digits.txt");
  if (!res.ok) throw new Error(`Failed to load pi digits: ${res.status}`);
  const text = await res.text();
  piDigits = text.slice(0, TOTAL_AVAILABLE_DIGITS);
  return piDigits;
}

export async function ensureDigitsLoaded(): Promise<void> {
  if (piDigits) return;
  if (!loadPromise) {
    loadPromise = fetchDigits();
  }
  await loadPromise;
}

export function isLoaded(): boolean {
  return piDigits !== null;
}

export function getPiDigit(index: number): string {
  if (!piDigits || index < 0 || index >= piDigits.length) return "";
  return piDigits[index];
}

export function getPiDigits(start: number, count: number): string {
  if (!piDigits) return "";
  return piDigits.slice(start, start + count);
}
