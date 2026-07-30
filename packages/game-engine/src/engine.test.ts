import type { CardInstance } from "@tenfold/shared";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  CARD_DEFINITIONS,
  createCardDeck,
  createGame,
  createPlayerView,
  SeededRandomSource,
} from ".";
import type { GameCommand, GameState } from ".";

const random = (): SeededRandomSource => new SeededRandomSource(42);
const players = [
  { id: "p1", nickname: "アオイ" },
  { id: "p2", nickname: "レン" },
];

function card(type: CardInstance["type"], suffix = "x"): CardInstance {
  const rank = CARD_DEFINITIONS.find((definition) => definition.type === type)?.rank;
  if (!rank) throw new Error("missing card definition");
  return { id: `test-${type}-${suffix}`, type, rank };
}

function fixture(): GameState {
  const state = createGame(players, { random: random(), firstPlayerIndex: 0, id: "test-game" });
  state.phase = "WAITING_FOR_PLAY";
  state.currentPlayerId = "p1";
  state.players[0]!.hand = [card("SOLDIER", "play"), card("NOBLE", "keep")];
  state.players[1]!.hand = [card("SAGE", "target")];
  state.deck = [card("BOY", "deck-1"), card("MAIDEN", "deck-2")];
  state.reincarnationCard = card("SPIRIT", "rebirth");
  state.pendingAction = null;
  state.logs = [];
  state.processedCommandIds = [];
  return state;
}

function run(state: GameState, command: GameCommand): GameState {
  return applyCommand(state, command, random()).state;
}

function play(state: GameState, cardId: string, commandId = crypto.randomUUID()): GameState {
  return run(state, { type: "PLAY_CARD", commandId, playerId: "p1", cardId });
}

function chooseTarget(state: GameState, targetPlayerId = "p2"): GameState {
  return run(state, {
    type: "SELECT_TARGET",
    commandId: crypto.randomUUID(),
    playerId: "p1",
    targetPlayerId,
  });
}

describe("card setup", () => {
  it("contains exactly the configured 18 cards", () => {
    const deck = createCardDeck();
    expect(deck).toHaveLength(18);
    expect(new Set(deck.map((entry) => entry.id)).size).toBe(18);
    expect(Object.fromEntries(CARD_DEFINITIONS.map((entry) => [entry.rank, entry.count]))).toEqual({
      1: 2,
      2: 2,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
      7: 2,
      8: 2,
      9: 1,
      10: 1,
    });
  });

  it("deals one each, seals one card, then begins with a draw", () => {
    const state = createGame(
      [...players, { id: "p3", nickname: "ミナ" }, { id: "p4", nickname: "ソラ" }],
      { random: random(), firstPlayerIndex: 0 },
    );
    expect(state.reincarnationCard).not.toBeNull();
    expect(state.players.map((player) => player.hand.length)).toEqual([2, 1, 1, 1]);
    expect(state.deck).toHaveLength(12);
    expect(state.phase).toBe("WAITING_FOR_PLAY");
  });
});

describe("command validation", () => {
  it("does not allow the hero to be voluntarily played", () => {
    const state = fixture();
    state.players[0]!.hand = [card("HERO"), card("BOY")];
    expect(() => play(state, state.players[0]!.hand[0]!.id)).toThrow("英雄は自分から");
  });

  it("rejects out-of-turn, unknown-card and duplicate commands", () => {
    const state = fixture();
    expect(() =>
      run(state, {
        type: "PLAY_CARD",
        commandId: crypto.randomUUID(),
        playerId: "p2",
        cardId: state.players[1]!.hand[0]!.id,
      }),
    ).toThrow("手番");
    expect(() => play(state, "missing")).toThrow("存在しないカード");

    const commandId = crypto.randomUUID();
    const once = play(state, state.players[0]!.hand[0]!.id, commandId);
    expect(() =>
      run(once, {
        type: "SELECT_TARGET",
        commandId,
        playerId: "p1",
        targetPlayerId: "p2",
      }),
    ).toThrow("二重送信");
  });
});

describe("turn progression", () => {
  it("changes the current player before dealing that player's turn draw", () => {
    const state = fixture();
    state.players[0]!.hand = [card("MAIDEN", "play"), card("NOBLE", "keep")];
    state.players[1]!.hand = [card("SAGE", "waiting")];
    state.deck = [card("BOY", "next-turn-draw"), card("SEER", "after")];

    const next = play(state, "test-MAIDEN-play");

    expect(next.currentPlayerId).toBe("p2");
    expect(next.turnNumber).toBe(2);
    expect(next.players[0]!.hand.map((entry) => entry.id)).toEqual(["test-NOBLE-keep"]);
    expect(next.players[1]!.hand.map((entry) => entry.id)).toEqual([
      "test-SAGE-waiting",
      "test-BOY-next-turn-draw",
    ]);
    expect(next.logs.at(-1)?.message).toBe("レンの手番です");
  });
});

describe("card effects", () => {
  it("auto-selects the only opponent but keeps the choice with multiple opponents", () => {
    const duel = fixture();
    duel.players[0]!.hand = [card("SEER", "play"), card("BOY", "keep")];
    const duelResult = play(duel, duel.players[0]!.hand[0]!.id);
    expect(duelResult.phase).not.toBe("WAITING_FOR_TARGET");
    expect(createPlayerView(duelResult, "p1").privatePeek?.card.type).toBe("SAGE");
    expect(createPlayerView(duelResult, "p1").legalTargetIds).toEqual([]);

    const multiplayer = createGame([...players, { id: "p3", nickname: "ミナ" }], {
      random: random(),
      firstPlayerIndex: 0,
      id: "multi-target-game",
    });
    multiplayer.phase = "WAITING_FOR_PLAY";
    multiplayer.currentPlayerId = "p1";
    multiplayer.players[0]!.hand = [card("SEER", "multi-play"), card("BOY", "multi-keep")];
    multiplayer.players[1]!.hand = [card("SAGE", "p2-target")];
    multiplayer.players[2]!.hand = [card("MAIDEN", "p3-target")];
    const prompted = play(multiplayer, "test-SEER-multi-play");
    expect(prompted.phase).toBe("WAITING_FOR_TARGET");
    expect(createPlayerView(prompted, "p1").legalTargetIds).toEqual(["p2", "p3"]);
    expect(chooseTarget(prompted).phase).not.toBe("WAITING_FOR_TARGET");
  });

  it("resolves emperor execution and prevents hero reincarnation", () => {
    const state = fixture();
    state.players[0]!.hand = [card("EMPEROR", "play"), card("BOY", "keep")];
    state.players[1]!.hand = [card("HERO", "target")];
    state.deck = [card("SAGE", "draw"), card("MAIDEN", "after")];
    const prompted = play(state, state.players[0]!.hand[0]!.id);
    expect(prompted.phase).toBe("WAITING_FOR_PUBLIC_EXECUTION_CHOICE");
    expect(prompted.pendingAction?.kind).toBe("PUBLIC_EXECUTION");
    const resolved = run(prompted, {
      type: "SELECT_PUBLIC_EXECUTION_CARD",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      cardId: card("HERO", "target").id,
    });
    expect(resolved.players[1]!.isAlive).toBe(false);
    expect(resolved.reincarnationUsed).toBe(false);
  });

  it("exchanges hands with spirit", () => {
    const state = fixture();
    state.players[0]!.hand = [card("SPIRIT", "play"), card("HERO", "own")];
    state.players[1]!.hand = [card("BOY", "other")];
    const resolved = play(state, state.players[0]!.hand[0]!.id);
    expect(resolved.players[0]!.hand[0]!.type).toBe("BOY");
    expect(resolved.players[1]!.hand[0]!.type).toBe("HERO");
  });

  it("lets sage choose from three and reshuffles the rest", () => {
    const state = fixture();
    state.players[0]!.hand = [card("SAGE", "play"), card("BOY", "keep")];
    state.deck = [
      card("HERO", "a"),
      card("EMPEROR", "b"),
      card("SPIRIT", "c"),
      card("MAIDEN", "d"),
    ];
    const afterPlay = play(state, state.players[0]!.hand[0]!.id);
    expect(afterPlay.players[0]!.sagePending).toBe(true);
    afterPlay.currentPlayerId = "p1";
    afterPlay.phase = "TURN_START";
    const nextTurn = structuredClone(afterPlay);
    nextTurn.players[1]!.isAlive = false;
    nextTurn.players[1]!.hand = [];
    nextTurn.players[1]!.discards = [];
    // A second living seat is needed while directly exercising the next-turn transition.
    nextTurn.players[1]!.isAlive = true;
    nextTurn.currentPlayerId = "p2";
    nextTurn.phase = "WAITING_FOR_PLAY";
    nextTurn.players[1]!.hand = [card("MAIDEN", "p2-play"), card("BOY", "p2-keep")];
    const returned = run(nextTurn, {
      type: "PLAY_CARD",
      commandId: crypto.randomUUID(),
      playerId: "p2",
      cardId: nextTurn.players[1]!.hand[0]!.id,
    });
    expect(returned.phase).toBe("WAITING_FOR_SAGE_CHOICE");
    expect(
      returned.pendingAction?.kind === "SAGE" ? returned.pendingAction.candidates : [],
    ).toHaveLength(3);
    const candidates =
      returned.pendingAction?.kind === "SAGE" ? returned.pendingAction.candidates : [];
    const selected = candidates.find((entry) => entry.type === "HERO") ?? candidates[0]!;
    const chosen = run(returned, {
      type: "SELECT_SAGE_CARD",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      cardId: selected.id,
    });
    expect(chosen.players[0]!.hand).toContainEqual(selected);
    expect(chosen.deck).toHaveLength(2);
  });

  it.each([1, 2])("sage draws only the remaining %i card(s)", (count) => {
    const state = fixture();
    state.currentPlayerId = "p2";
    state.players[0]!.sagePending = true;
    state.players[1]!.hand = [card("BOY", "keep")];
    state.players[0]!.hand = [card("MAIDEN", "play"), card("SPIRIT", "keep")];
    state.deck = Array.from({ length: count }, (_, index) =>
      card(index ? "SOLDIER" : "NOBLE", `sage-${index}`),
    );
    const result = run(state, {
      type: "PLAY_CARD",
      commandId: crypto.randomUUID(),
      playerId: "p2",
      cardId: state.players[1]!.hand[0]!.id,
    });
    expect(result.phase).toBe("WAITING_FOR_SAGE_CHOICE");
    expect(
      result.pendingAction?.kind === "SAGE" ? result.pendingAction.candidates : [],
    ).toHaveLength(count);
  });

  it("resolves noble win and equal-rank mutual elimination", () => {
    const win = fixture();
    win.players[0]!.hand = [card("NOBLE", "play"), card("EMPEROR", "keep")];
    win.players[1]!.hand = [card("BOY", "target")];
    const winResult = play(win, win.players[0]!.hand[0]!.id);
    expect(winResult.players[1]!.isAlive).toBe(false);
    expect(winResult.winnerIds).toEqual(["p1"]);
    expect(
      winResult.logs.some((entry) => entry.message === "貴族の対決：アオイ VS レン — アオイ WIN"),
    ).toBe(true);
    expect(createPlayerView(winResult, "p1").lastNobleDuel).toMatchObject({
      actorId: "p1",
      targetId: "p2",
      actorCard: { type: "EMPEROR", rank: 9 },
      targetCard: { type: "BOY", rank: 1 },
      winnerId: "p1",
    });

    const tie = fixture();
    tie.players[0]!.hand = [card("NOBLE", "play"), card("SAGE", "keep")];
    tie.players[1]!.hand = [card("SAGE", "target")];
    const tieResult = play(tie, tie.players[0]!.hand[0]!.id);
    expect(tieResult.players.every((player) => !player.isAlive)).toBe(true);
    expect(tieResult.resultType).toBe("DRAW");
    expect(
      tieResult.logs.some((entry) => entry.message === "貴族の対決：アオイ VS レン — DRAW"),
    ).toBe(true);
    expect(createPlayerView(tieResult, "p2").lastNobleDuel).toMatchObject({
      actorCard: { type: "SAGE", rank: 7 },
      targetCard: { type: "SAGE", rank: 7 },
      winnerId: null,
    });
  });

  it("keeps death choices hidden and reincarnates a discarded hero", () => {
    const state = fixture();
    state.players[0]!.hand = [card("DEATH", "play"), card("NOBLE", "keep")];
    state.players[1]!.hand = [card("HERO", "target")];
    state.deck = [card("BOY", "draw"), card("MAIDEN", "after")];
    const prompted = play(state, state.players[0]!.hand[0]!.id);
    expect(prompted.pendingAction?.kind).toBe("DEATH");
    const actorView = createPlayerView(prompted, "p1");
    expect(JSON.stringify(actorView)).not.toContain("test-HERO-target");
    const deathPending = prompted.pendingAction;
    if (deathPending?.kind !== "DEATH") throw new Error("missing death pending");
    const heroIndex = deathPending.cards.findIndex((entry) => entry.type === "HERO");
    const resolved = run(prompted, {
      type: "SELECT_DEATH_CARD",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      position: heroIndex === 0 ? "A" : "B",
    });
    expect(resolved.players[1]!.isAlive).toBe(true);
    expect(resolved.players[1]!.hand[0]!.id).toBe("test-SPIRIT-rebirth");
    expect(resolved.reincarnationUsed).toBe(true);
  });

  it("protects a player until the start of their next turn", () => {
    const state = fixture();
    state.players[0]!.hand = [card("SEER", "play"), card("BOY", "keep")];
    state.players[1]!.isProtected = true;
    const resolved = play(state, state.players[0]!.hand[0]!.id);
    expect(resolved.players[0]!.privatePeek).toBeNull();
    expect(resolved.logs.at(-2)?.message ?? resolved.logs.at(-1)?.message).toMatch(/守護/);

    const maiden = fixture();
    maiden.players[0]!.hand = [card("MAIDEN", "play"), card("BOY", "keep")];
    const after = play(maiden, maiden.players[0]!.hand[0]!.id);
    expect(after.players[0]!.isProtected).toBe(true);
  });

  it("shows seer information only to the actor", () => {
    const state = fixture();
    state.players[0]!.hand = [card("SEER", "play"), card("BOY", "keep")];
    const result = play(state, state.players[0]!.hand[0]!.id);
    expect(createPlayerView(result, "p1").privatePeek?.card.type).toBe("SAGE");
    expect(createPlayerView(result, "p2").privatePeek).toBeNull();
  });

  it("resolves soldier misses, hits and hero reincarnation", () => {
    const missState = play(fixture(), "test-SOLDIER-play");
    const miss = run(missState, {
      type: "SELECT_GUESS",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      guessRank: 8,
    });
    expect(miss.players[1]!.isAlive).toBe(true);
    expect(miss.logs.some((entry) => entry.message.includes("ランク8「精霊」"))).toBe(true);

    const hitState = play(fixture(), "test-SOLDIER-play");
    const hit = run(hitState, {
      type: "SELECT_GUESS",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      guessRank: 7,
    });
    expect(hit.players[1]!.isAlive).toBe(false);
    expect(hit.logs.some((entry) => entry.message.includes("ランク7「賢者」"))).toBe(true);

    const heroState = fixture();
    heroState.players[1]!.hand = [card("HERO", "target")];
    const heroPrompt = play(heroState, "test-SOLDIER-play");
    const heroResult = run(heroPrompt, {
      type: "SELECT_GUESS",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      guessRank: 10,
    });
    expect(heroResult.players[1]!.isAlive).toBe(true);
    expect(heroResult.reincarnationUsed).toBe(true);
  });

  it("makes only the second boy trigger execution and allows hero reincarnation", () => {
    const first = fixture();
    first.players[0]!.hand = [card("BOY", "first"), card("NOBLE", "keep")];
    const afterFirst = play(first, first.players[0]!.hand[0]!.id);
    expect(afterFirst.boyPlayedCount).toBe(1);
    expect(afterFirst.pendingAction?.kind).not.toBe("TARGET");

    const second = fixture();
    second.boyPlayedCount = 1;
    second.players[0]!.hand = [card("BOY", "second"), card("NOBLE", "keep")];
    second.players[1]!.hand = [card("HERO", "target")];
    second.deck = [card("SAGE", "draw"), card("MAIDEN", "after")];
    const prompted = play(second, second.players[0]!.hand[0]!.id);
    const result = run(prompted, {
      type: "SELECT_PUBLIC_EXECUTION_CARD",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      cardId: "test-HERO-target",
    });
    expect(result.players[1]!.isAlive).toBe(true);
    expect(result.reincarnationUsed).toBe(true);
  });

  it("cannot reincarnate twice", () => {
    const state = fixture();
    state.reincarnationUsed = true;
    state.reincarnationCard = null;
    state.players[1]!.hand = [card("HERO", "target")];
    const prompted = play(state, "test-SOLDIER-play");
    const result = run(prompted, {
      type: "SELECT_GUESS",
      commandId: crypto.randomUUID(),
      playerId: "p1",
      guessRank: 10,
    });
    expect(result.players[1]!.isAlive).toBe(false);
  });
});

describe("ending and information boundaries", () => {
  it("ends on deck exhaustion with highest-rank win or draw", () => {
    const state = fixture();
    state.players[0]!.hand = [card("MAIDEN", "play"), card("EMPEROR", "keep")];
    state.players[1]!.hand = [card("SAGE", "other")];
    state.deck = [];
    const win = play(state, state.players[0]!.hand[0]!.id);
    expect(win.resultType).toBe("WIN");
    expect(win.winnerIds).toEqual(["p1"]);

    const tied = fixture();
    tied.players[0]!.hand = [card("MAIDEN", "play"), card("SAGE", "keep")];
    tied.players[1]!.hand = [card("SAGE", "other")];
    tied.deck = [];
    const draw = play(tied, tied.players[0]!.hand[0]!.id);
    expect(draw.resultType).toBe("DRAW");
    expect(draw.winnerIds.sort()).toEqual(["p1", "p2"]);
  });

  it("never includes the deck, reincarnation card or opponent hand in a normal view", () => {
    const state = fixture();
    const view = createPlayerView(state, "p1");
    const payload = JSON.stringify(view);
    expect(payload).not.toContain(state.deck[0]!.id);
    expect(payload).not.toContain(state.reincarnationCard!.id);
    expect(payload).not.toContain(state.players[1]!.hand[0]!.id);
    expect(Object.hasOwn(view, "deck")).toBe(false);
    expect(Object.hasOwn(view, "reincarnationCard")).toBe(false);
  });
});
