import { ZodError } from "zod";
import {
  applyCommand,
  createGame,
  createPlayerView,
  CryptoRandomSource,
  GameRuleError,
  type GameCommand,
  type GameState,
} from "@tenfold/game-engine";
import type { ConnectionStatus, RoomView } from "@tenfold/shared";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_MUTATION_ATTEMPTS = 5;
const random = new CryptoRandomSource();

export interface OnlineRoomPlayer {
  id: string;
  nickname: string;
  seat: number;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  token: string;
}

export interface OnlineRoomState {
  code: string;
  status: "LOBBY" | "PLAYING" | "FINISHED";
  players: OnlineRoomPlayer[];
  game: GameState | null;
  createdAt: number;
  updatedAt: number;
}

interface LoadedRoom {
  state: OnlineRoomState;
  version: number;
}

interface StoredRoomRow {
  code: string;
  state: string;
  version: number;
  created_at: number;
  updated_at: number;
  expires_at: number;
}

interface OnlineRoomStatement {
  bind(...values: unknown[]): OnlineRoomStatement;
  run(): Promise<{ meta: { changes?: number | bigint } }>;
  first<T>(): Promise<T | null>;
}

export interface OnlineRoomDatabase {
  prepare(query: string): OnlineRoomStatement;
}

export class OnlineRoomError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "OnlineRoomError";
  }
}

export class OnlineRoomRepository {
  constructor(private readonly db: OnlineRoomDatabase) {}

  async deleteExpired(): Promise<void> {
    await this.db.prepare("DELETE FROM online_rooms WHERE expires_at < ?").bind(Date.now()).run();
  }

  async create(room: OnlineRoomState): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO online_rooms
          (code, state, version, created_at, updated_at, expires_at)
         VALUES (?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        room.code,
        JSON.stringify(room),
        room.createdAt,
        room.updatedAt,
        room.updatedAt + ROOM_LIFETIME_MS,
      )
      .run();
  }

  async load(code: string): Promise<LoadedRoom | null> {
    const row = await this.db
      .prepare(
        `SELECT code, state, version, created_at, updated_at, expires_at
         FROM online_rooms
         WHERE code = ?`,
      )
      .bind(code)
      .first<StoredRoomRow>();
    if (!row) return null;
    return {
      state: JSON.parse(row.state) as OnlineRoomState,
      version: row.version,
    };
  }

  async save(loaded: LoadedRoom): Promise<boolean> {
    const now = Date.now();
    loaded.state.updatedAt = now;
    const result = await this.db
      .prepare(
        `UPDATE online_rooms
         SET state = ?, version = ?, updated_at = ?, expires_at = ?
         WHERE code = ? AND version = ?`,
      )
      .bind(
        JSON.stringify(loaded.state),
        loaded.version + 1,
        now,
        now + ROOM_LIFETIME_MS,
        loaded.state.code,
        loaded.version,
      )
      .run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async delete(code: string): Promise<void> {
    await this.db.prepare("DELETE FROM online_rooms WHERE code = ?").bind(code).run();
  }
}

function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
}

function createToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

function createPlayer(nickname: string, seat: number, isHost: boolean): OnlineRoomPlayer {
  return {
    id: crypto.randomUUID(),
    nickname,
    seat,
    isHost,
    connectionStatus: "CONNECTED",
    token: createToken(),
  };
}

export async function createOnlineRoom(
  repository: OnlineRoomRepository,
  nickname: string,
): Promise<{
  room: OnlineRoomState;
  player: OnlineRoomPlayer;
}> {
  await repository.deleteExpired();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const now = Date.now();
    const code = createRoomCode();
    const player = createPlayer(nickname, 0, true);
    const room: OnlineRoomState = {
      code,
      status: "LOBBY",
      players: [player],
      game: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await repository.create(room);
      return { room, player };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("UNIQUE") && !message.includes("constraint")) throw error;
    }
  }

  throw new OnlineRoomError("ルームを作成できませんでした。もう一度お試しください", 503);
}

async function loadOnlineRoom(repository: OnlineRoomRepository, code: string): Promise<LoadedRoom> {
  const row = await repository.load(code);
  if (!row || row.state.updatedAt + ROOM_LIFETIME_MS < Date.now()) {
    if (row) await repository.delete(code);
    throw new OnlineRoomError("このルームは見つかりません", 404);
  }
  return row;
}

async function mutateOnlineRoom<T>(
  repository: OnlineRoomRepository,
  code: string,
  mutation: (room: OnlineRoomState) => T,
): Promise<{ room: OnlineRoomState; result: T }> {
  for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
    const loaded = await loadOnlineRoom(repository, code);
    const result = mutation(loaded.state);
    if (await repository.save(loaded)) return { room: loaded.state, result };
  }
  throw new OnlineRoomError("同時に操作が行われました。もう一度お試しください", 409);
}

function playerByToken(room: OnlineRoomState, token: string): OnlineRoomPlayer {
  const player = room.players.find((candidate) => candidate.token === token);
  if (!player) throw new OnlineRoomError("参加情報が無効です。ルームへ入り直してください", 401);
  return player;
}

export async function joinOnlineRoom(
  repository: OnlineRoomRepository,
  code: string,
  nickname: string,
): Promise<{ room: OnlineRoomState; player: OnlineRoomPlayer }> {
  const { room, result } = await mutateOnlineRoom(repository, code, (current) => {
    if (current.status !== "LOBBY") {
      throw new OnlineRoomError("このルームはすでに対戦中です");
    }
    if (current.players.length >= 4) throw new OnlineRoomError("このルームは満員です");
    const player = createPlayer(nickname, current.players.length, false);
    current.players.push(player);
    return player;
  });
  return { room, player: result };
}

export async function getOnlineRoomView(
  repository: OnlineRoomRepository,
  code: string,
  token: string,
): Promise<RoomView> {
  const { state } = await loadOnlineRoom(repository, code);
  const player = playerByToken(state, token);
  return createOnlineRoomView(state, player.id);
}

export async function startOnlineRoom(
  repository: OnlineRoomRepository,
  code: string,
  token: string,
): Promise<RoomView> {
  const { room, result: playerId } = await mutateOnlineRoom(repository, code, (current) => {
    const player = playerByToken(current, token);
    if (!player.isHost) throw new OnlineRoomError("主催者だけが対戦を開始できます", 403);
    if (current.status !== "LOBBY") throw new OnlineRoomError("このルームは対戦中です");
    if (current.players.length < 2) throw new OnlineRoomError("対戦には2人以上必要です");
    current.game = createGame(
      current.players.map((candidate) => ({
        id: candidate.id,
        nickname: candidate.nickname,
      })),
      {
        id: `game-${current.code}-${Date.now()}`,
        random,
        firstPlayerIndex: random.int(current.players.length),
      },
    );
    current.status = "PLAYING";
    return player.id;
  });
  return createOnlineRoomView(room, playerId);
}

export async function commandOnlineRoom(
  repository: OnlineRoomRepository,
  code: string,
  token: string,
  command: GameCommand,
): Promise<RoomView> {
  const { room, result: playerId } = await mutateOnlineRoom(repository, code, (current) => {
    const player = playerByToken(current, token);
    if (!current.game || current.status !== "PLAYING") {
      throw new OnlineRoomError("ゲームが始まっていません");
    }
    const trustedCommand = { ...command, playerId: player.id } as GameCommand;
    current.game = applyCommand(current.game, trustedCommand, random).state;
    if (current.game.phase === "FINISHED") current.status = "FINISHED";
    return player.id;
  });
  return createOnlineRoomView(room, playerId);
}

export async function rematchOnlineRoom(
  repository: OnlineRoomRepository,
  code: string,
  token: string,
): Promise<RoomView> {
  const { room, result: playerId } = await mutateOnlineRoom(repository, code, (current) => {
    const player = playerByToken(current, token);
    if (current.status !== "FINISHED") {
      throw new OnlineRoomError("対戦終了後にもう一度お試しください");
    }
    current.game = createGame(
      current.players.map((candidate) => ({
        id: candidate.id,
        nickname: candidate.nickname,
      })),
      {
        id: `game-${current.code}-${Date.now()}`,
        random,
        firstPlayerIndex: random.int(current.players.length),
      },
    );
    current.status = "PLAYING";
    return player.id;
  });
  return createOnlineRoomView(room, playerId);
}

export async function leaveOnlineRoom(
  repository: OnlineRoomRepository,
  code: string,
  token: string,
): Promise<void> {
  const loaded = await loadOnlineRoom(repository, code);
  const leaving = playerByToken(loaded.state, token);

  if (loaded.state.status === "LOBBY") {
    loaded.state.players = loaded.state.players
      .filter((player) => player.id !== leaving.id)
      .map((player, seat) => ({ ...player, seat }));
    if (loaded.state.players.length === 0) {
      await repository.delete(code);
      return;
    }
    if (leaving.isHost) loaded.state.players[0]!.isHost = true;
  } else {
    leaving.connectionStatus = "DISCONNECTED";
    const gamePlayer = loaded.state.game?.players.find((player) => player.id === leaving.id);
    if (gamePlayer) gamePlayer.connectionStatus = "DISCONNECTED";
  }

  if (!(await repository.save(loaded))) {
    throw new OnlineRoomError("退出処理が競合しました。もう一度お試しください", 409);
  }
}

export function createOnlineRoomView(room: OnlineRoomState, playerId: string): RoomView {
  return {
    code: room.code,
    status: room.status,
    selfPlayerId: playerId,
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      seat: player.seat,
      isBot: false,
      isHost: player.isHost,
      connectionStatus: player.connectionStatus,
    })),
    game: room.game ? createPlayerView(room.game, playerId) : null,
  };
}

export function toOnlineRoomError(error: unknown): OnlineRoomError {
  if (error instanceof OnlineRoomError) return error;
  if (error instanceof GameRuleError) return new OnlineRoomError(error.message);
  if (error instanceof ZodError) return new OnlineRoomError("入力内容が不正です");
  const message = error instanceof Error ? error.message : "";
  if (message.includes("no such table")) {
    return new OnlineRoomError("オンライン対戦の準備中です。少し待ってからお試しください", 503);
  }
  return new OnlineRoomError("オンライン操作を完了できませんでした", 500);
}
