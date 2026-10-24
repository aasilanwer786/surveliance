export interface VoiceAlertData {
  event: string;
  message: string;
  priority: string;
  voice: string;
  volume: number;
  repeatCount: number;
  repeatIntervalSeconds: number;
  targetRoles: string[];
}

let enabled = true;
let mutedUntil = 0;
let currentAlert = 0;

export function setVoiceEnabled(value: boolean) {
  enabled = value;
  if (!value) stopSpeaking();
}

export function isVoiceEnabled() {
  return enabled;
}

export function muteVoice(ms: number) {
  mutedUntil = Date.now() + ms;
  stopSpeaking();
}

export function stopSpeaking() {
  currentAlert += 1;
  window.speechSynthesis?.cancel?.();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang)) ?? voices[0];
}

export function speakVoiceAlert(data: VoiceAlertData): void {
  if (!enabled || Date.now() < mutedUntil) {
    stopSpeaking();
    return;
  }
  if (!window.speechSynthesis) return;
  const repeat = Math.max(1, Math.min(data.repeatCount ?? 1, 5));
  const gapMs = Math.max(1, (data.repeatIntervalSeconds ?? 0) * 1000);

  const token = (currentAlert += 1);
  window.speechSynthesis.cancel();

  const speakOnce = (attempt: number) => {
    if (token !== currentAlert) return;
    const u = new SpeechSynthesisUtterance(data.message);
    u.rate = 1.02;
    u.pitch = data.priority === "EMERGENCY" || data.priority === "CRITICAL" ? 1.15 : 1;
    u.volume = Math.min(1, Math.max(0, data.volume ?? 1));
    const voice = pickVoice(data.voice || "en-US");
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
    if (attempt < repeat) {
      setTimeout(() => speakOnce(attempt + 1), Math.max(gapMs, 2500));
    }
  };
  speakOnce(1);
}

export function primeVoices(): void {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
