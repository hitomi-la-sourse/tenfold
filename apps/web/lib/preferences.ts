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
