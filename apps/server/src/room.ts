import { randomBytes, randomUUID } from "node:crypto";
import type { GameState } from "@tenfold/game-engine";
import type { BotLevel, ConnectionStatus, RoomView } from "@tenfold/shared";

export interface RoomPlayer {
  id: string;
  nickname: string;
  seat: number;
  isBot: boolean;
  botLevel: BotLevel;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  socketId: string | null;
  reconnectToken: string | null;
}

export interface Room {
  code: string;
  status: "LOBBY" | "PLAYING" | "FINISHED";
  players: RoomPlayer[];
  game: GameState | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface RoomRepository {
  create(room: Room): Promise<void>;
  findByCode(code: string): Promise<Room | null>;
  save(room: Room): Promise<void>;
  delete(code: string): Promise<void>;
  all(): Promise<Room[]>;
}

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, Room>();

  async create(room: Room): Promise<void> {
    if (this.rooms.has(room.code)) throw new Error("ROOM_EXISTS");
    this.rooms.set(room.code, room);
  }

  async findByCode(code: string): Promise<Room | null> {
    return this.rooms.get(code) ?? null;
  }

  async save(room: Room): Promise<void> {
    room.updatedAt = Date.now();
    this.rooms.set(room.code, room);
  }

  async delete(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async all(): Promise<Room[]> {
    return [...this.rooms.values()];
  }
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
}

export function createReconnectToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createHumanPlayer(
  nickname: string,
  seat: number,
  socketId: string,
  isHost: boolean,
): RoomPlayer {
  return {
    id: randomUUID(),
    nickname,
    seat,
    isBot: false,
    botLevel: "NORMAL",
    isHost,
    connectionStatus: "CONNECTED",
    socketId,
    reconnectToken: createReconnectToken(),
  };
}

export function createBotPlayer(seat: number, level: BotLevel): RoomPlayer {
  return {
    id: randomUUID(),
    nickname: `CPU ${seat + 1}`,
    seat,
    isBot: true,
    botLevel: level,
    isHost: false,
    connectionStatus: "CONNECTED",
    socketId: null,
    reconnectToken: null,
  };
}

export function createRoomView(room: Room, playerId: string): RoomView {
  return {
    code: room.code,
    status: room.status,
    selfPlayerId: playerId,
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      seat: player.seat,
      isBot: player.isBot,
      isHost: player.isHost,
      connectionStatus: player.connectionStatus,
    })),
    game: null,
  };
}
