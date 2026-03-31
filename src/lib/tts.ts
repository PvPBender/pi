// Text-to-Speech for digit readback using Web Speech API

const TTS_AVAILABLE = typeof window !== "undefined" && "speechSynthesis" in window;

let ttsEnabled = false;
let ttsSpeed = 1.0;

export function setTTSEnabled(enabled: boolean): void {
  ttsEnabled = enabled;
}

export function setTTSSpeed(speed: number): void {
  ttsSpeed = Math.max(0.5, Math.min(2.0, speed));
}

export function isTTSAvailable(): boolean {
  return TTS_AVAILABLE;
}

export function isTTSEnabled(): boolean {
  return ttsEnabled && TTS_AVAILABLE;
}

function speak(text: string, rate?: number): void {
  if (!TTS_AVAILABLE || !ttsEnabled) return;
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate ?? ttsSpeed;
  utterance.pitch = 1.0;
  utterance.volume = 0.8;
  // Prefer English voice
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith("en"));
  if (enVoice) utterance.voice = enVoice;
  window.speechSynthesis.speak(utterance);
}

export function speakDigit(digit: string): void {
  speak(digit);
}

export function speakChunk(chunk: string, speed?: number): void {
  if (!TTS_AVAILABLE || !ttsEnabled) return;
  // Speak each digit with a slight pause between them
  const text = chunk.split("").join(", ");
  speak(text, speed ?? ttsSpeed);
}

export function speakPosition(position: number): void {
  speak(`Position ${position.toLocaleString()}`);
}

export function stopSpeaking(): void {
  if (!TTS_AVAILABLE) return;
  window.speechSynthesis.cancel();
}
