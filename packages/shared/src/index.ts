import { z } from "zod";

export const CARD_TYPES = [
  "HERO",
  "EMPEROR",
  "SPIRIT",
  "SAGE",
  "NOBLE",
  "DEATH",
  "MAIDEN",
  "SEER",
  "SOLDIER",
  "BOY",
] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type BotLevel = "EASY" | "NORMAL";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED";

export interface CardDefinition {
  type: CardType;
  rank: number;
  count: number;
  effectKey: string;
  displayName: string;
  effectName: string;
  description: string;
}

export interface CardInstance {
  id: string;
  type: CardType;
  rank: number;
}

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "ニックネームを入力してください")
  .max(16, "ニックネームは16文字以内です")
  .transform((value) => value.replace(/[\u0000-\u001F\u007F]/g, ""));

export const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/, "ルームコードが不正です");
export const tokenSchema = z.string().min(32).max(256);
export const commandIdSchema = z.string().uuid();

const playerIdSchema = z.string().min(1).max(80);
const cardIdSchema = z.string().min(1).max(80);

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
  nickname: nicknameSchema,
});

export const reconnectSchema = z.object({
  code: roomCodeSchema,
  token: tokenSchema,
});

export const roomCodeOnlySchema = z.object({ code: roomCodeSchema });
export const addBotSchema = z.object({
  code: roomCodeSchema,
  level: z.enum(["EASY", "NORMAL"]).default("NORMAL"),
});

export const playCardSchema = z.object({
  commandId: commandIdSchema,
  cardId: cardIdSchema,
});

export const selectTargetSchema = z.object({
  commandId: commandIdSchema,
  targetPlayerId: playerIdSchema,
});

export const selectGuessSchema = z.object({
  commandId: commandIdSchema,
  guessRank: z.number().int().min(1).max(10),
});

export const selectCardSchema = z.object({
  commandId: commandIdSchema,
  cardId: cardIdSchema,
});

export const selectDeathSchema = z.object({
  commandId: commandIdSchema,
  position: z.enum(["A", "B"]),
});

export interface PublicPlayerView {
  id: string;
  seat: number;
  nickname: string;
  isBot: boolean;
  isAlive: boolean;
  isProtected: boolean;
  connectionStatus: ConnectionStatus;
  discards: CardInstance[];
  revealedHand?: CardInstance[];
  eliminatedReason?: string;
}

export interface PlayerGameView {
  gameId: string;
  phase: string;
  currentPlayerId: string;
  turnNumber: number;
  deckCount: number;
  reincarnationAvailable: boolean;
  boyPlayedCount: number;
  players: PublicPlayerView[];
  selfPlayerId: string;
  selfHand: CardInstance[];
  legalCardIds: string[];
  legalTargetIds: string[];
  privateSageCandidates: CardInstance[];
  privatePeek: { playerId: string; card: CardInstance } | null;
  privateDeathCards: CardInstance[];
  pendingPublic:
    | { kind: "TARGET"; effect: string }
    | { kind: "GUESS"; targetPlayerId: string }
    | { kind: "PUBLIC_EXECUTION"; targetPlayerId: string; cards: CardInstance[] }
    | { kind: "DEATH"; targetPlayerId: string; positions: ["A", "B"] }
    | { kind: "SAGE" }
    | null;
  winnerIds: string[];
  resultType: "WIN" | "DRAW" | null;
  logs: Array<{ id: string; turn: number; message: string }>;
}

export interface RoomPlayerView {
  id: string;
  nickname: string;
  seat: number;
  isBot: boolean;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
}

export interface RoomView {
  code: string;
  status: "LOBBY" | "PLAYING" | "FINISHED";
  selfPlayerId: string;
  players: RoomPlayerView[];
  game: PlayerGameView | null;
}

export interface ServerToClientEvents {
  "room:state": (view: RoomView) => void;
  "room:error": (error: { message: string }) => void;
  "matchmaking:status": (status: {
    state: "WAITING" | "MATCHED" | "CANCELLED";
    code?: string;
  }) => void;
  "game:state": (view: PlayerGameView) => void;
  "game:error": (error: { message: string }) => void;
  "game:finished": (view: PlayerGameView) => void;
  "player:disconnected": (data: { playerId: string }) => void;
  "player:reconnected": (data: { playerId: string }) => void;
}

export interface ClientToServerEvents {
  "room:create": (payload: z.input<typeof createRoomSchema>, ack?: (data: unknown) => void) => void;
  "room:join": (payload: z.input<typeof joinRoomSchema>, ack?: (data: unknown) => void) => void;
  "room:leave": (payload: z.input<typeof roomCodeOnlySchema>) => void;
  "room:start": (payload: z.input<typeof roomCodeOnlySchema>) => void;
  "room:add-bot": (payload: z.input<typeof addBotSchema>) => void;
  "room:remove-bot": (payload: { code: string; playerId: string }) => void;
  "matchmaking:join": (
    payload: z.input<typeof createRoomSchema>,
    ack?: (data: unknown) => void,
  ) => void;
  "matchmaking:cancel": () => void;
  "game:play-card": (payload: z.input<typeof playCardSchema>) => void;
  "game:select-target": (payload: z.input<typeof selectTargetSchema>) => void;
  "game:select-guess": (payload: z.input<typeof selectGuessSchema>) => void;
  "game:select-public-execution-card": (payload: z.input<typeof selectCardSchema>) => void;
  "game:select-death-card": (payload: z.input<typeof selectDeathSchema>) => void;
  "game:select-sage-card": (payload: z.input<typeof selectCardSchema>) => void;
  "game:request-rematch": (payload: z.input<typeof roomCodeOnlySchema>) => void;
  "player:reconnect": (
    payload: z.input<typeof reconnectSchema>,
    ack?: (data: unknown) => void,
  ) => void;
}

export const CLIENT_EVENTS = [
  "room:create",
  "room:join",
  "room:leave",
  "room:start",
  "room:add-bot",
  "room:remove-bot",
  "matchmaking:join",
  "matchmaking:cancel",
  "game:play-card",
  "game:select-target",
  "game:select-guess",
  "game:select-public-execution-card",
  "game:select-death-card",
  "game:select-sage-card",
  "game:request-rematch",
  "player:reconnect",
] as const;
