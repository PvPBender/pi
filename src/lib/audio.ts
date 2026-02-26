// Pentatonic scale mapped to numpad positions
// Layout (phone-style):
//  1  2  3
//  4  5  6
//  7  8  9
//     0
//
// Mapped to C major pentatonic across 2 octaves
// Lower keys = lower pitch, creating melodic contours that mirror finger movement

const PENTATONIC_FREQUENCIES: Record<string, number> = {
  "7": 261.63, // C4 (bottom-left = lowest)
  "8": 293.66, // D4
  "9": 329.63, // E4
  "4": 392.0,  // G4
  "5": 440.0,  // A4 (center)
  "6": 523.25, // C5
  "1": 587.33, // D5
  "2": 659.25, // E5
  "3": 783.99, // G5 (top-right = highest)
  "0": 349.23, // F4 (thumb position, middle pitch)
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function playTone(digit: string, duration = 0.08): void {
  const freq = PENTATONIC_FREQUENCIES[digit];
  if (!freq) return;

  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playErrorTone(): void {
  const ctx = getAudioContext();

  // Dissonant interval — tritone
  [311.13, 440].forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  });
}

export function playSuccessTone(): void {
  const ctx = getAudioContext();
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const startTime = ctx.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0.12, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  });
}
