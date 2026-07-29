import type {
  BotLevel,
  CardInstance,
  CardType,
  ConnectionStatus,
  NobleDuelResolution,
} from "@tenfold/shared";

export type GamePhase =
  | "TURN_START"
  | "WAITING_FOR_PLAY"
  | "WAITING_FOR_TARGET"
  | "WAITING_FOR_GUESS"
  | "WAITING_FOR_PUBLIC_EXECUTION_CHOICE"
  | "WAITING_FOR_DEATH_CHOICE"
  | "WAITING_FOR_SAGE_CHOICE"
  | "RESOLVING"
  | "FINISHED";

export interface PlayerState {
  id: string;
  seat: number;
  nickname: string;
  isBot: boolean;
  botLevel?: BotLevel;
  isAlive: boolean;
  hand: CardInstance[];
  discards: CardInstance[];
  isProtected: boolean;
  sagePending: boolean;
  connectionStatus: ConnectionStatus;
  privatePeek: { playerId: string; card: CardInstance } | null;
  eliminatedReason?: string;
}

export type TargetEffect = "EMPEROR" | "SPIRIT" | "NOBLE" | "DEATH" | "SEER" | "SOLDIER" | "BOY";

export type PendingAction =
  | {
      kind: "TARGET";
      actorId: string;
      effect: TargetEffect;
      sourceCardId: string;
    }
  | {
      kind: "GUESS";
      actorId: string;
      targetPlayerId: string;
      sourceCardId: string;
    }
  | {
      kind: "PUBLIC_EXECUTION";
      actorId: string;
      targetPlayerId: string;
      source: "EMPEROR" | "BOY";
      cards: CardInstance[];
    }
  | {
      kind: "DEATH";
      actorId: string;
      targetPlayerId: string;
      cards: [CardInstance, CardInstance];
    }
  | {
      kind: "SAGE";
      actorId: string;
      candidates: CardInstance[];
    };

export interface GameLogEntry {
  id: string;
  turn: number;
  message: string;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: PlayerState[];
  deck: CardInstance[];
  reincarnationCard: CardInstance | null;
  reincarnationUsed: boolean;
  currentPlayerId: string;
  turnNumber: number;
  boyPlayedCount: number;
  pendingAction: PendingAction | null;
  lastNobleDuel: NobleDuelResolution | null;
  winnerIds: string[];
  resultType: "WIN" | "DRAW" | null;
  logs: GameLogEntry[];
  processedCommandIds: string[];
}

export interface PlayerSetup {
  id: string;
  nickname: string;
  isBot?: boolean;
  botLevel?: BotLevel;
}

export interface RandomSource {
  int(maxExclusive: number): number;
}

export type GameCommand =
  | { type: "PLAY_CARD"; commandId: string; playerId: string; cardId: string }
  | { type: "SELECT_TARGET"; commandId: string; playerId: string; targetPlayerId: string }
  | { type: "SELECT_GUESS"; commandId: string; playerId: string; guessRank: number }
  | {
      type: "SELECT_PUBLIC_EXECUTION_CARD";
      commandId: string;
      playerId: string;
      cardId: string;
    }
  | { type: "SELECT_DEATH_CARD"; commandId: string; playerId: string; position: "A" | "B" }
  | { type: "SELECT_SAGE_CARD"; commandId: string; playerId: string; cardId: string };

export interface ApplyCommandResult {
  state: GameState;
  events: Array<{ type: string; message?: string }>;
}

export class GameRuleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

export type HeroDiscardSource = "EMPEROR" | "BOY" | "DEATH" | "SOLDIER";

export interface HeroDiscardInput {
  sourceEffect: HeroDiscardSource;
  playerId: string;
  state: GameState;
}

export function isCardType(value: string): value is CardType {
  return [
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
  ].includes(value);
}
