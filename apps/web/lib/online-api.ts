import type { GameCommand } from "@tenfold/game-engine";
import type { RoomView } from "@tenfold/shared";

export interface OnlineEntryResponse {
  code: string;
  playerId: string;
  reconnectToken: string;
}

export class OnlineApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OnlineApiError";
  }
}

async function requestOnline<T>(
  method: "GET" | "POST",
  input: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const query =
    method === "GET" ? `?${new URLSearchParams(input as Record<string, string>).toString()}` : "";
  const response = await fetch(`/api/online${query}`, {
    method,
    cache: "no-store",
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new OnlineApiError(payload.error || "オンライン通信に失敗しました", response.status);
  }
  return payload as T;
}

export async function createOnlineRoom(nickname: string): Promise<OnlineEntryResponse> {
  return requestOnline("POST", { action: "CREATE", nickname });
}

export async function joinOnlineRoom(code: string, nickname: string): Promise<OnlineEntryResponse> {
  return requestOnline("POST", { action: "JOIN", code, nickname });
}

export async function fetchOnlineRoom(code: string, token: string): Promise<RoomView> {
  const payload = await requestOnline<{ room: RoomView }>("GET", { code }, token);
  return payload.room;
}

async function mutateRoom(
  code: string,
  token: string,
  action: "START" | "COMMAND" | "REMATCH",
  extra: Record<string, unknown> = {},
): Promise<RoomView> {
  const payload = await requestOnline<{ room: RoomView }>(
    "POST",
    { action, code, ...extra },
    token,
  );
  return payload.room;
}

export function startOnlineRoom(code: string, token: string): Promise<RoomView> {
  return mutateRoom(code, token, "START");
}

export function commandOnlineRoom(
  code: string,
  token: string,
  command: GameCommand,
): Promise<RoomView> {
  return mutateRoom(code, token, "COMMAND", { command });
}

export function rematchOnlineRoom(code: string, token: string): Promise<RoomView> {
  return mutateRoom(code, token, "REMATCH");
}

export async function leaveOnlineRoom(code: string, token: string): Promise<void> {
  await requestOnline("POST", { action: "LEAVE", code }, token);
}
