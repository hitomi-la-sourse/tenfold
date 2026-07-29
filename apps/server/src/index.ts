import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Server } from "socket.io";
import {
  addBotSchema,
  createRoomSchema,
  joinRoomSchema,
  playCardSchema,
  reconnectSchema,
  roomCodeOnlySchema,
  selectCardSchema,
  selectDeathSchema,
  selectGuessSchema,
  selectTargetSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@tenfold/shared";
import type { GameCommand } from "@tenfold/game-engine";
import { GameRuleError } from "@tenfold/game-engine";
import { ZodError, type ZodType } from "zod";
import { GameService } from "./game-service.js";
import {
  createBotPlayer,
  createHumanPlayer,
  createRoomCode,
  InMemoryRoomRepository,
  type Room,
  type RoomPlayer,
} from "./room.js";

const port = Number(process.env.GAME_SERVER_PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const reconnectGrace = Number(process.env.RECONNECT_GRACE_SECONDS ?? 60) * 1000;
const roomTtl = Number(process.env.ROOM_TTL_MINUTES ?? 60) * 60_000;
const finishedRoomTtl = Number(process.env.FINISHED_ROOM_TTL_MINUTES ?? 30) * 60_000;

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    redact: ["req.headers.authorization", "*.reconnectToken", "*.hand", "*.deck"],
  },
});
await app.register(cors, { origin: webOrigin, credentials: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
app.get("/health", async () => ({ status: "ok", service: "tenfold-game-server" }));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: webOrigin, credentials: true },
  maxHttpBufferSize: 10_000,
});
const repository = new InMemoryRoomRepository();
const gameService = new GameService(repository, io);
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const socketEvents = new Map<string, number[]>();
let quickWaiting: { socketId: string; player: RoomPlayer } | null = null;

function safeMessage(error: unknown): string {
  if (error instanceof GameRuleError) return error.message;
  if (error instanceof ZodError) return "入力内容が不正です";
  if (error instanceof Error && error.message.startsWith("このルーム")) return error.message;
  return "不正な操作が拒否されました";
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

function allowSocketEvent(socketId: string): boolean {
  const now = Date.now();
  const recent = (socketEvents.get(socketId) ?? []).filter((time) => now - time < 10_000);
  if (recent.length >= 40) return false;
  recent.push(now);
  socketEvents.set(socketId, recent);
  return true;
}

async function uniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createRoomCode();
    if (!(await repository.findByCode(code))) return code;
  }
  throw new Error("ROOM_CODE_EXHAUSTED");
}

async function roomForSocket(socketId: string): Promise<{ room: Room; player: RoomPlayer } | null> {
  for (const room of await repository.all()) {
    const player = room.players.find((candidate) => candidate.socketId === socketId);
    if (player) return { room, player };
  }
  return null;
}

async function createRoomWithHost(
  nickname: string,
  socketId: string,
): Promise<{ room: Room; player: RoomPlayer }> {
  const player = createHumanPlayer(nickname, 0, socketId, true);
  const room: Room = {
    code: await uniqueRoomCode(),
    status: "LOBBY",
    players: [player],
    game: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: null,
  };
  await repository.create(room);
  return { room, player };
}

function ackSuccess(
  ack: ((data: unknown) => void) | undefined,
  room: Room,
  player: RoomPlayer,
): void {
  ack?.({
    ok: true,
    code: room.code,
    playerId: player.id,
    reconnectToken: player.reconnectToken,
  });
}

io.on("connection", (socket) => {
  socket.use((_event, next) => {
    if (!allowSocketEvent(socket.id)) {
      next(new Error("操作が多すぎます"));
      return;
    }
    next();
  });

  socket.on("room:create", async (payload, ack) => {
    try {
      const { nickname } = parse(createRoomSchema, payload);
      const existing = await roomForSocket(socket.id);
      if (existing) throw new Error("この接続はすでにルームへ参加しています");
      const { room, player } = await createRoomWithHost(nickname, socket.id);
      await socket.join(room.code);
      ackSuccess(ack, room, player);
      gameService.emitRoom(room);
    } catch (error) {
      const message = safeMessage(error);
      socket.emit("room:error", { message });
      ack?.({ ok: false, message });
    }
  });

  socket.on("room:join", async (payload, ack) => {
    try {
      const { code, nickname } = parse(joinRoomSchema, payload);
      const room = await repository.findByCode(code);
      if (!room) throw new Error("このルームは見つかりません");
      if (room.status !== "LOBBY") throw new Error("このルームはすでに対戦中です");
      if (room.players.length >= 4) throw new Error("このルームは満員です");
      const player = createHumanPlayer(nickname, room.players.length, socket.id, false);
      room.players.push(player);
      await repository.save(room);
      await socket.join(room.code);
      ackSuccess(ack, room, player);
      gameService.emitRoom(room);
    } catch (error) {
      const message = safeMessage(error);
      socket.emit("room:error", { message });
      ack?.({ ok: false, message });
    }
  });

  socket.on("room:add-bot", async (payload) => {
    try {
      const { code, level } = parse(addBotSchema, payload);
      const room = await repository.findByCode(code);
      const actor = room?.players.find((player) => player.socketId === socket.id);
      if (!room || !actor?.isHost || room.status !== "LOBBY") throw new Error("不正な操作です");
      if (room.players.length >= 4) throw new Error("このルームは満員です");
      room.players.push(createBotPlayer(room.players.length, level));
      await repository.save(room);
      gameService.emitRoom(room);
    } catch (error) {
      socket.emit("room:error", { message: safeMessage(error) });
    }
  });

  socket.on("room:remove-bot", async (payload) => {
    try {
      const codePayload = parse(roomCodeOnlySchema, { code: payload.code });
      const room = await repository.findByCode(codePayload.code);
      const actor = room?.players.find((player) => player.socketId === socket.id);
      const target = room?.players.find((player) => player.id === payload.playerId);
      if (!room || !actor?.isHost || !target?.isBot || room.status !== "LOBBY") {
        throw new Error("不正な操作です");
      }
      room.players = room.players
        .filter((player) => player.id !== target.id)
        .map((player, seat) => ({ ...player, seat }));
      await repository.save(room);
      gameService.emitRoom(room);
    } catch (error) {
      socket.emit("room:error", { message: safeMessage(error) });
    }
  });

  socket.on("room:start", async (payload) => {
    try {
      const { code } = parse(roomCodeOnlySchema, payload);
      const room = await repository.findByCode(code);
      const actor = room?.players.find((player) => player.socketId === socket.id);
      if (!room || !actor?.isHost || room.status !== "LOBBY") throw new Error("不正な操作です");
      if (room.players.length < 2) throw new Error("対戦には2人以上必要です");
      await gameService.start(room);
    } catch (error) {
      socket.emit("room:error", { message: safeMessage(error) });
    }
  });

  const handleGame = async <T>(
    schema: ZodType<T>,
    payload: unknown,
    toCommand: (value: T, playerId: string) => GameCommand,
  ): Promise<void> => {
    try {
      const value = parse(schema, payload);
      const found = await roomForSocket(socket.id);
      if (!found?.room.game) throw new Error("ゲームが始まっていません");
      await gameService.command(found.room, found.player.id, toCommand(value, found.player.id));
    } catch (error) {
      socket.emit("game:error", { message: safeMessage(error) });
    }
  };

  socket.on("game:play-card", (payload) =>
    handleGame(playCardSchema, payload, (value, playerId) => ({
      type: "PLAY_CARD",
      playerId,
      commandId: value.commandId,
      cardId: value.cardId,
    })),
  );
  socket.on("game:select-target", (payload) =>
    handleGame(selectTargetSchema, payload, (value, playerId) => ({
      type: "SELECT_TARGET",
      playerId,
      commandId: value.commandId,
      targetPlayerId: value.targetPlayerId,
    })),
  );
  socket.on("game:select-guess", (payload) =>
    handleGame(selectGuessSchema, payload, (value, playerId) => ({
      type: "SELECT_GUESS",
      playerId,
      commandId: value.commandId,
      guessRank: value.guessRank,
    })),
  );
  socket.on("game:select-public-execution-card", (payload) =>
    handleGame(selectCardSchema, payload, (value, playerId) => ({
      type: "SELECT_PUBLIC_EXECUTION_CARD",
      playerId,
      commandId: value.commandId,
      cardId: value.cardId,
    })),
  );
  socket.on("game:select-death-card", (payload) =>
    handleGame(selectDeathSchema, payload, (value, playerId) => ({
      type: "SELECT_DEATH_CARD",
      playerId,
      commandId: value.commandId,
      position: value.position,
    })),
  );
  socket.on("game:select-sage-card", (payload) =>
    handleGame(selectCardSchema, payload, (value, playerId) => ({
      type: "SELECT_SAGE_CARD",
      playerId,
      commandId: value.commandId,
      cardId: value.cardId,
    })),
  );

  socket.on("matchmaking:join", async (payload, ack) => {
    try {
      const { nickname } = parse(createRoomSchema, payload);
      const player = createHumanPlayer(nickname, 0, socket.id, true);
      if (!quickWaiting || quickWaiting.socketId === socket.id) {
        quickWaiting = { socketId: socket.id, player };
        socket.emit("matchmaking:status", { state: "WAITING" });
        ack?.({ ok: true, state: "WAITING", reconnectToken: player.reconnectToken });
        return;
      }
      const first = quickWaiting;
      quickWaiting = null;
      first.player.isHost = true;
      first.player.seat = 0;
      player.isHost = false;
      player.seat = 1;
      const room: Room = {
        code: await uniqueRoomCode(),
        status: "LOBBY",
        players: [first.player, player],
        game: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        finishedAt: null,
      };
      await repository.create(room);
      const firstSocket = io.sockets.sockets.get(first.socketId);
      await firstSocket?.join(room.code);
      await socket.join(room.code);
      firstSocket?.emit("matchmaking:status", { state: "MATCHED", code: room.code });
      socket.emit("matchmaking:status", { state: "MATCHED", code: room.code });
      ackSuccess(ack, room, player);
      gameService.emitRoom(room);
      await gameService.start(room);
    } catch (error) {
      const message = safeMessage(error);
      socket.emit("room:error", { message });
      ack?.({ ok: false, message });
    }
  });

  socket.on("matchmaking:cancel", () => {
    if (quickWaiting?.socketId === socket.id) quickWaiting = null;
    socket.emit("matchmaking:status", { state: "CANCELLED" });
  });

  socket.on("player:reconnect", async (payload, ack) => {
    try {
      const { code, token } = parse(reconnectSchema, payload);
      const room = await repository.findByCode(code);
      const player = room?.players.find((candidate) => candidate.reconnectToken === token);
      if (!room || !player || player.isBot) throw new Error("再接続情報が無効です");
      player.socketId = socket.id;
      player.connectionStatus = "CONNECTED";
      if (room.game) {
        const gamePlayer = room.game.players.find((candidate) => candidate.id === player.id);
        if (gamePlayer) gamePlayer.connectionStatus = "CONNECTED";
      }
      const timer = disconnectTimers.get(player.id);
      if (timer) clearTimeout(timer);
      disconnectTimers.delete(player.id);
      await socket.join(room.code);
      await repository.save(room);
      ackSuccess(ack, room, player);
      io.to(room.code).emit("player:reconnected", { playerId: player.id });
      gameService.emitRoom(room);
    } catch (error) {
      const message = safeMessage(error);
      ack?.({ ok: false, message });
      socket.emit("room:error", { message });
    }
  });

  socket.on("room:leave", async (payload) => {
    try {
      const { code } = parse(roomCodeOnlySchema, payload);
      const room = await repository.findByCode(code);
      const player = room?.players.find((candidate) => candidate.socketId === socket.id);
      if (!room || !player) return;
      player.reconnectToken = null;
      player.socketId = null;
      if (room.status === "LOBBY") {
        room.players = room.players
          .filter((candidate) => candidate.id !== player.id)
          .map((candidate, seat) => ({ ...candidate, seat }));
        if (room.players.length === 0) await repository.delete(room.code);
        else {
          if (player.isHost) room.players[0]!.isHost = true;
          await repository.save(room);
          gameService.emitRoom(room);
        }
      }
      await socket.leave(code);
    } catch {
      socket.emit("room:error", { message: "ルームを退出できませんでした" });
    }
  });

  socket.on("game:request-rematch", async (payload) => {
    try {
      const { code } = parse(roomCodeOnlySchema, payload);
      const room = await repository.findByCode(code);
      const actor = room?.players.find((player) => player.socketId === socket.id);
      if (!room || !actor || room.status !== "FINISHED") throw new Error("不正な操作です");
      if (room.players.some((player) => !player.isBot && player.connectionStatus !== "CONNECTED")) {
        throw new Error("全員の再接続を待っています");
      }
      await gameService.start(room);
    } catch (error) {
      socket.emit("game:error", { message: safeMessage(error) });
    }
  });

  socket.on("disconnect", async () => {
    socketEvents.delete(socket.id);
    if (quickWaiting?.socketId === socket.id) quickWaiting = null;
    const found = await roomForSocket(socket.id);
    if (!found) return;
    const { room, player } = found;
    player.socketId = null;
    player.connectionStatus = "DISCONNECTED";
    if (room.game) {
      const gamePlayer = room.game.players.find((candidate) => candidate.id === player.id);
      if (gamePlayer) gamePlayer.connectionStatus = "DISCONNECTED";
    }
    await repository.save(room);
    io.to(room.code).emit("player:disconnected", { playerId: player.id });
    gameService.emitRoom(room);
    const timer = setTimeout(async () => {
      const latest = await repository.findByCode(room.code);
      const disconnected = latest?.players.find((candidate) => candidate.id === player.id);
      if (!latest || !disconnected || disconnected.connectionStatus === "CONNECTED") return;
      disconnected.isBot = true;
      disconnected.botLevel = "NORMAL";
      disconnected.nickname = `${disconnected.nickname}（CPU）`;
      disconnected.reconnectToken = null;
      disconnected.connectionStatus = "CONNECTED";
      if (latest.game) {
        const gamePlayer = latest.game.players.find(
          (candidate) => candidate.id === disconnected.id,
        );
        if (gamePlayer) {
          gamePlayer.isBot = true;
          gamePlayer.botLevel = "NORMAL";
          gamePlayer.connectionStatus = "CONNECTED";
        }
      }
      await repository.save(latest);
      gameService.emitRoom(latest);
      gameService.resumeBots(latest);
    }, reconnectGrace);
    disconnectTimers.set(player.id, timer);
  });
});

setInterval(async () => {
  const now = Date.now();
  for (const room of await repository.all()) {
    const expiredFinished = room.finishedAt !== null && now - room.finishedAt > finishedRoomTtl;
    const expiredLobby = room.status === "LOBBY" && now - room.updatedAt > roomTtl;
    if (expiredFinished || expiredLobby) await repository.delete(room.code);
  }
}, 60_000).unref();

await app.listen({ port, host: "0.0.0.0" });
