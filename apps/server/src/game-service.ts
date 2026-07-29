import { botThinkDelay, chooseBotCommand } from "@tenfold/bot";
import {
  applyCommand,
  createGame,
  createPlayerView,
  CryptoRandomSource,
  listLegalCommands,
  type GameCommand,
} from "@tenfold/game-engine";
import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@tenfold/shared";
import type { Room, RoomRepository } from "./room.js";
import { createRoomView } from "./room.js";

type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;

export class GameService {
  private readonly random = new CryptoRandomSource();
  private readonly botTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly repository: RoomRepository,
    private readonly io: GameIo,
    private readonly botDelayDisabled = process.env.NODE_ENV === "test",
  ) {}

  async start(room: Room): Promise<void> {
    room.game = createGame(
      room.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        isBot: player.isBot,
        botLevel: player.botLevel,
      })),
      { id: `game-${room.code}-${Date.now()}`, random: this.random },
    );
    room.status = "PLAYING";
    room.finishedAt = null;
    await this.repository.save(room);
    this.emitRoom(room);
    this.scheduleBot(room);
  }

  async command(room: Room, playerId: string, command: GameCommand): Promise<void> {
    if (!room.game) throw new Error("ゲームが始まっていません");
    const result = applyCommand(room.game, command, this.random);
    room.game = result.state;
    if (room.game.phase === "FINISHED") {
      room.status = "FINISHED";
      room.finishedAt = Date.now();
    }
    await this.repository.save(room);
    this.emitRoom(room);
    this.scheduleBot(room);
    void playerId;
  }

  emitRoom(room: Room): void {
    for (const player of room.players) {
      if (!player.socketId) continue;
      const roomView = createRoomView(room, player.id);
      if (room.game) roomView.game = createPlayerView(room.game, player.id);
      this.io.to(player.socketId).emit("room:state", roomView);
      if (roomView.game) {
        this.io.to(player.socketId).emit("game:state", roomView.game);
        if (room.status === "FINISHED") {
          this.io.to(player.socketId).emit("game:finished", roomView.game);
        }
      }
    }
  }

  resumeBots(room: Room): void {
    this.scheduleBot(room);
  }

  private scheduleBot(room: Room): void {
    const current = room.game?.players.find((player) => player.id === room.game?.currentPlayerId);
    if (!room.game || room.status !== "PLAYING" || !current?.isBot) return;
    if (this.botTimers.has(room.code)) return;
    const timer = setTimeout(
      () => {
        this.botTimers.delete(room.code);
        void this.runBot(room.code);
      },
      botThinkDelay(this.random, room.game.phase, this.botDelayDisabled),
    );
    this.botTimers.set(room.code, timer);
  }

  private async runBot(code: string): Promise<void> {
    const room = await this.repository.findByCode(code);
    if (!room?.game || room.status !== "PLAYING") return;
    const bot = room.players.find((player) => player.id === room.game?.currentPlayerId);
    if (!bot?.isBot) return;
    const legalCommands = listLegalCommands(room.game, bot.id);
    if (legalCommands.length === 0) return;
    const view = createPlayerView(room.game, bot.id);
    const command = chooseBotCommand({
      view,
      legalCommands,
      level: bot.botLevel,
      random: this.random,
    });
    await this.command(room, bot.id, command);
  }
}

