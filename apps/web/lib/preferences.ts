"use client";

export const STORAGE_KEYS = {
  nickname: "tenfold:nickname",
  sound: "tenfold:sound",
  tutorial: "tenfold:tutorial-seen",
  reconnect: (code: string) => `tenfold:reconnect:${code}`,
} as const;

export function getNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEYS.nickname) ?? "";
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(STORAGE_KEYS.nickname, nickname);
}

export function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEYS.sound) !== "off";
}

export function saveSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.sound, enabled ? "on" : "off");
}

export function playEffect(kind: "play" | "win", enabled: boolean): void {
  if (!enabled) return;
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = kind === "win" ? 660 : 240;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
  oscillator.addEventListener("ended", () => void context.close(), { once: true });
}
