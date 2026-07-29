import {
  commandIdSchema,
  createRoomSchema,
  joinRoomSchema,
  playCardSchema,
  roomCodeSchema,
  selectCardSchema,
  selectDeathSchema,
  selectGuessSchema,
  selectTargetSchema,
  tokenSchema,
} from "@tenfold/shared";
import type { GameCommand } from "@tenfold/game-engine";
import {
  commandOnlineRoom,
  createOnlineRoom,
  getOnlineRoomView,
  joinOnlineRoom,
  leaveOnlineRoom,
  type OnlineRoomDatabase,
  OnlineRoomRepository,
  rematchOnlineRoom,
  startOnlineRoom,
  toOnlineRoomError,
} from "@/lib/online-room-service";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function tokenFrom(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return tokenSchema.parse(token);
}

function parseCommand(value: unknown, playerId = "server"): GameCommand {
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("操作内容が不正です");
  }
  const command = value as Record<string, unknown>;
  const type = String(command.type);
  if (type === "PLAY_CARD") {
    const payload = playCardSchema.parse(command);
    return { type, ...payload, playerId };
  }
  if (type === "SELECT_TARGET") {
    const payload = selectTargetSchema.parse(command);
    return { type, ...payload, playerId };
  }
  if (type === "SELECT_GUESS") {
    const payload = selectGuessSchema.parse(command);
    return { type, ...payload, playerId };
  }
  if (type === "SELECT_PUBLIC_EXECUTION_CARD") {
    const payload = selectCardSchema.parse(command);
    return { type, ...payload, playerId };
  }
  if (type === "SELECT_DEATH_CARD") {
    const payload = selectDeathSchema.parse(command);
    return { type, ...payload, playerId };
  }
  if (type === "SELECT_SAGE_CARD") {
    const payload = selectCardSchema.parse(command);
    return { type, ...payload, playerId };
  }
  commandIdSchema.parse(command.commandId);
  throw new Error("未対応の操作です");
}

async function get(request: Request, repository: OnlineRoomRepository): Promise<Response> {
  try {
    const code = roomCodeSchema.parse(new URL(request.url).searchParams.get("code") ?? "");
    const token = tokenFrom(request);
    return json({ room: await getOnlineRoomView(repository, code, token) });
  } catch (error) {
    const safe = toOnlineRoomError(error);
    return json({ error: safe.message }, safe.status);
  }
}

async function post(request: Request, repository: OnlineRoomRepository): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "CREATE") {
      const { nickname } = createRoomSchema.parse(body);
      const { room, player } = await createOnlineRoom(repository, nickname);
      return json(
        {
          code: room.code,
          playerId: player.id,
          reconnectToken: player.token,
        },
        201,
      );
    }

    if (action === "JOIN") {
      const { code, nickname } = joinRoomSchema.parse(body);
      const { player } = await joinOnlineRoom(repository, code, nickname);
      return json({
        code,
        playerId: player.id,
        reconnectToken: player.token,
      });
    }

    const code = roomCodeSchema.parse(body.code);
    const token = tokenFrom(request);

    if (action === "START") {
      return json({ room: await startOnlineRoom(repository, code, token) });
    }
    if (action === "COMMAND") {
      return json({
        room: await commandOnlineRoom(repository, code, token, parseCommand(body.command)),
      });
    }
    if (action === "REMATCH") {
      return json({ room: await rematchOnlineRoom(repository, code, token) });
    }
    if (action === "LEAVE") {
      await leaveOnlineRoom(repository, code, token);
      return json({ ok: true });
    }

    return json({ error: "未対応の操作です" }, 400);
  } catch (error) {
    const safe = toOnlineRoomError(error);
    return json({ error: safe.message }, safe.status);
  }
}

export async function handleOnlineApiRequest(
  request: Request,
  db: OnlineRoomDatabase,
): Promise<Response> {
  const repository = new OnlineRoomRepository(db);
  if (request.method === "GET") return get(request, repository);
  if (request.method === "POST") return post(request, repository);
  return json({ error: "未対応のHTTPメソッドです" }, 405);
}
