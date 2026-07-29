import type { GameCommand } from "@tenfold/game-engine";
import { CARD_BY_TYPE } from "@tenfold/game-engine";
import type { BotLevel, PlayerGameView } from "@tenfold/shared";

export interface BotRandom {
  int(maxExclusive: number): number;
}

export interface BotDecisionInput {
  view: PlayerGameView;
  legalCommands: readonly GameCommand[];
  level: BotLevel;
  random: BotRandom;
}

function randomChoice<T>(items: readonly T[], random: BotRandom): T {
  const selected = items[random.int(items.length)];
  if (!selected) throw new Error("CPUに合法手がありません");
  return selected;
}

function rankForPlay(command: GameCommand, view: PlayerGameView): number {
  if (command.type !== "PLAY_CARD") return 0;
  return view.selfHand.find((card) => card.id === command.cardId)?.rank ?? 0;
}

function normalPlayScore(command: GameCommand, view: PlayerGameView): number {
  if (command.type !== "PLAY_CARD") return 0;
  const card = view.selfHand.find((candidate) => candidate.id === command.cardId);
  if (!card) return 0;
  const keptRank = Math.max(
    0,
    ...view.selfHand
      .filter((candidate) => candidate.id !== card.id)
      .map((candidate) => candidate.rank),
  );
  const baseScores: Record<string, number> = {
    HERO: -100,
    EMPEROR: 8,
    SPIRIT: keptRank <= 3 ? 7 : 2,
    SAGE: 7,
    NOBLE: keptRank >= 7 ? 9 : 1,
    DEATH: 6,
    MAIDEN: keptRank >= 7 ? 10 : 4,
    SEER: 6,
    SOLDIER: view.privatePeek ? 11 : 5,
    BOY: view.boyPlayedCount >= 1 ? 9 : 3,
  };
  return baseScores[card.type] ?? 0;
}

function knownRankForTarget(view: PlayerGameView, targetId: string): number | null {
  if (view.privatePeek?.playerId === targetId) return view.privatePeek.card.rank;
  return null;
}

export function chooseBotCommand(input: BotDecisionInput): GameCommand {
  const { view, legalCommands, level, random } = input;
  if (legalCommands.length === 0) throw new Error("CPUに合法手がありません");
  if (level === "EASY") {
    if (view.phase === "WAITING_FOR_SAGE_CHOICE") {
      return [...legalCommands].sort(
        (left, right) => rankForPlay(right, view) - rankForPlay(left, view),
      )[0]!;
    }
    return randomChoice(legalCommands, random);
  }

  const first = legalCommands[0]!;
  if (first.type === "PLAY_CARD") {
    return [...legalCommands].sort(
      (left, right) => normalPlayScore(right, view) - normalPlayScore(left, view),
    )[0]!;
  }
  if (first.type === "SELECT_GUESS") {
    const targetId = view.pendingPublic?.kind === "GUESS" ? view.pendingPublic.targetPlayerId : "";
    const knownRank = knownRankForTarget(view, targetId);
    if (knownRank) {
      return (
        legalCommands.find(
          (command) => command.type === "SELECT_GUESS" && command.guessRank === knownRank,
        ) ?? first
      );
    }
    const discardedRanks = new Set(
      view.players.flatMap((player) => player.discards.map((card) => card.rank)),
    );
    const likely = [...legalCommands]
      .filter(
        (command): command is Extract<GameCommand, { type: "SELECT_GUESS" }> =>
          command.type === "SELECT_GUESS",
      )
      .sort((left, right) => {
        const leftRemaining = CARD_BY_TYPE[
          view.selfHand.find((card) => card.rank === left.guessRank)?.type ?? "BOY"
        ]
          ? Number(!discardedRanks.has(left.guessRank))
          : 0;
        const rightRemaining = Number(!discardedRanks.has(right.guessRank));
        return rightRemaining - leftRemaining;
      });
    return likely[0] ?? first;
  }
  if (first.type === "SELECT_SAGE_CARD") {
    return [...legalCommands].sort((left, right) => {
      const leftRank =
        left.type === "SELECT_SAGE_CARD"
          ? (view.privateSageCandidates.find((card) => card.id === left.cardId)?.rank ?? 0)
          : 0;
      const rightRank =
        right.type === "SELECT_SAGE_CARD"
          ? (view.privateSageCandidates.find((card) => card.id === right.cardId)?.rank ?? 0)
          : 0;
      return rightRank - leftRank;
    })[0]!;
  }
  if (first.type === "SELECT_TARGET") {
    const targetByKnowledge = legalCommands.find(
      (command) =>
        command.type === "SELECT_TARGET" &&
        knownRankForTarget(view, command.targetPlayerId) !== null,
    );
    return targetByKnowledge ?? randomChoice(legalCommands, random);
  }
  if (first.type === "SELECT_PUBLIC_EXECUTION_CARD") {
    return [...legalCommands].sort((left, right) => {
      const leftRank =
        left.type === "SELECT_PUBLIC_EXECUTION_CARD"
          ? ((view.pendingPublic?.kind === "PUBLIC_EXECUTION"
              ? view.pendingPublic.cards.find((card) => card.id === left.cardId)?.rank
              : 0) ?? 0)
          : 0;
      const rightRank =
        right.type === "SELECT_PUBLIC_EXECUTION_CARD"
          ? ((view.pendingPublic?.kind === "PUBLIC_EXECUTION"
              ? view.pendingPublic.cards.find((card) => card.id === right.cardId)?.rank
              : 0) ?? 0)
          : 0;
      return rightRank - leftRank;
    })[0]!;
  }
  return randomChoice(legalCommands, random);
}

export function botThinkDelay(
  random: BotRandom,
  phase: PlayerGameView["phase"],
  disabled = false,
): number {
  if (disabled) return 0;
  if (phase === "WAITING_FOR_PLAY") return 2400 + random.int(601);
  if (phase === "WAITING_FOR_SAGE_CHOICE") return 1800 + random.int(501);
  return 2200 + random.int(601);
}

