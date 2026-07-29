import type { CardInstance, PlayerGameView } from "@tenfold/shared";
import { CARD_BY_TYPE, createCardDeck } from "./cards";
import { CryptoRandomSource, shuffle } from "./random";
import type {
  ApplyCommandResult,
  GameCommand,
  GameState,
  HeroDiscardInput,
  PlayerSetup,
  PlayerState,
  RandomSource,
  TargetEffect,
} from "./types";
import { GameRuleError } from "./types";

const TARGET_EFFECTS = new Set<TargetEffect>([
  "EMPEROR",
  "SPIRIT",
  "NOBLE",
  "DEATH",
  "SEER",
  "SOLDIER",
  "BOY",
]);

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function requirePlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new GameRuleError("プレイヤーが見つかりません", "PLAYER_NOT_FOUND");
  return player;
}

function addLog(state: GameState, message: string): void {
  state.logs.push({
    id: `log-${state.logs.length + 1}-${state.turnNumber}`,
    turn: state.turnNumber,
    message,
  });
}

function drawCard(state: GameState): CardInstance | null {
  return state.deck.shift() ?? null;
}

function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((player) => player.isAlive);
}

function playableCards(player: PlayerState): CardInstance[] {
  return player.hand.filter((card) => card.type !== "HERO");
}

function eliminatePlayers(
  state: GameState,
  eliminations: Array<{ playerId: string; reason: string }>,
): void {
  for (const elimination of eliminations) {
    const player = requirePlayer(state, elimination.playerId);
    if (!player.isAlive) continue;
    player.isAlive = false;
    player.eliminatedReason = elimination.reason;
    player.discards.push(...player.hand);
    player.hand = [];
    player.isProtected = false;
    player.sagePending = false;
    player.privatePeek = null;
    addLog(state, `${player.nickname}が脱落しました（${elimination.reason}）`);
  }
}

function finishBySurvivors(state: GameState): boolean {
  const alive = alivePlayers(state);
  if (alive.length === 1) {
    state.phase = "FINISHED";
    state.pendingAction = null;
    state.resultType = "WIN";
    state.winnerIds = [alive[0]!.id];
    addLog(state, `${alive[0]!.nickname}の勝利です`);
    return true;
  }
  if (alive.length === 0) {
    state.phase = "FINISHED";
    state.pendingAction = null;
    state.resultType = "DRAW";
    state.winnerIds = [];
    addLog(state, "全員が脱落し、引き分けです");
    return true;
  }
  return false;
}

function finishByDeck(state: GameState): boolean {
  if (state.deck.length > 0) return false;
  const alive = alivePlayers(state);
  if (alive.length === 0) return finishBySurvivors(state);
  const maxRank = Math.max(...alive.map((player) => player.hand[0]?.rank ?? -1));
  const winners = alive.filter((player) => player.hand[0]?.rank === maxRank);
  state.phase = "FINISHED";
  state.pendingAction = null;
  state.resultType = winners.length === 1 ? "WIN" : "DRAW";
  state.winnerIds = winners.map((player) => player.id);
  addLog(
    state,
    winners.length === 1
      ? `山札が尽き、${winners[0]!.nickname}が最高位で勝利しました`
      : `山札が尽き、最高位が並んだため引き分けです`,
  );
  return true;
}

function nextAlivePlayer(state: GameState): PlayerState {
  const current = requirePlayer(state, state.currentPlayerId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(current.seat + offset) % state.players.length];
    if (candidate?.isAlive) return candidate;
  }
  throw new GameRuleError("次のプレイヤーが見つかりません", "NO_NEXT_PLAYER");
}

function beginTurn(state: GameState, random: RandomSource): void {
  const player = requirePlayer(state, state.currentPlayerId);
  player.isProtected = false;
  player.privatePeek = null;
  state.phase = "TURN_START";
  addLog(state, `${player.nickname}の手番です`);

  if (player.sagePending) {
    player.sagePending = false;
    const candidates = state.deck.splice(0, Math.min(3, state.deck.length));
    if (candidates.length === 0) {
      finishByDeck(state);
      return;
    }
    state.pendingAction = { kind: "SAGE", actorId: player.id, candidates };
    state.phase = "WAITING_FOR_SAGE_CHOICE";
    return;
  }

  const drawn = drawCard(state);
  if (!drawn) {
    finishByDeck(state);
    return;
  }
  player.hand.push(drawn);
  state.phase = "WAITING_FOR_PLAY";
  state.pendingAction = null;
  void random;
}

function finishTurn(state: GameState, random: RandomSource): void {
  state.pendingAction = null;
  if (finishBySurvivors(state) || finishByDeck(state)) return;
  const next = nextAlivePlayer(state);
  state.currentPlayerId = next.id;
  state.turnNumber += 1;
  beginTurn(state, random);
}

export function createGame(
  players: readonly PlayerSetup[],
  options: { id?: string; random?: RandomSource; firstPlayerIndex?: number } = {},
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new GameRuleError("プレイヤーは2～4人必要です", "INVALID_PLAYER_COUNT");
  }
  const random = options.random ?? new CryptoRandomSource();
  const deck = shuffle(createCardDeck(), random);
  const playerStates: PlayerState[] = players.map((player, seat) => ({
    id: player.id,
    seat,
    nickname: player.nickname,
    isBot: player.isBot ?? false,
    ...(player.botLevel ? { botLevel: player.botLevel } : {}),
    isAlive: true,
    hand: [],
    discards: [],
    isProtected: false,
    sagePending: false,
    connectionStatus: "CONNECTED",
    privatePeek: null,
  }));

  for (const player of playerStates) {
    const card = deck.shift();
    if (!card) throw new GameRuleError("カードの配布に失敗しました", "DEAL_FAILED");
    player.hand.push(card);
  }
  const reincarnationCard = deck.shift() ?? null;
  const firstPlayerIndex = options.firstPlayerIndex ?? random.int(playerStates.length);
  const first = playerStates[firstPlayerIndex];
  if (!first) throw new GameRuleError("先手を決められません", "FIRST_PLAYER_FAILED");

  const state: GameState = {
    id: options.id ?? globalThis.crypto.randomUUID(),
    phase: "TURN_START",
    players: playerStates,
    deck,
    reincarnationCard,
    reincarnationUsed: false,
    currentPlayerId: first.id,
    turnNumber: 1,
    boyPlayedCount: 0,
    pendingAction: null,
    winnerIds: [],
    resultType: null,
    logs: [],
    processedCommandIds: [],
  };
  addLog(state, "18枚のカードを配り、転生札を封印しました");
  beginTurn(state, random);
  return state;
}

export function resolveHeroDiscard({ sourceEffect, playerId, state }: HeroDiscardInput): void {
  const player = requirePlayer(state, playerId);
  const canReincarnate = sourceEffect !== "EMPEROR";
  if (canReincarnate && !state.reincarnationUsed && state.reincarnationCard) {
    player.discards.push(...player.hand);
    player.hand = [state.reincarnationCard];
    state.reincarnationCard = null;
    state.reincarnationUsed = true;
    addLog(state, `${player.nickname}が転生札でゲームへ復帰しました`);
    return;
  }
  eliminatePlayers(state, [
    {
      playerId,
      reason: canReincarnate ? "転生札が残っていません" : "公開処刑で英雄を失いました",
    },
  ]);
}

function setTargetPrompt(
  state: GameState,
  actorId: string,
  effect: TargetEffect,
  cardId: string,
  random: RandomSource,
): void {
  state.pendingAction = { kind: "TARGET", actorId, effect, sourceCardId: cardId };
  state.phase = "WAITING_FOR_TARGET";
  const targets = state.players.filter((player) => player.isAlive && player.id !== actorId);
  if (targets.length === 1) {
    selectTarget(
      state,
      {
        type: "SELECT_TARGET",
        commandId: `auto-target-${state.turnNumber}-${cardId}`,
        playerId: actorId,
        targetPlayerId: targets[0]!.id,
      },
      random,
    );
  }
}

function playCard(
  state: GameState,
  command: Extract<GameCommand, { type: "PLAY_CARD" }>,
  random: RandomSource,
): void {
  if (state.phase !== "WAITING_FOR_PLAY") {
    throw new GameRuleError("現在はカードを出せません", "WRONG_PHASE");
  }
  if (state.currentPlayerId !== command.playerId) {
    throw new GameRuleError("現在はあなたの手番ではありません", "NOT_YOUR_TURN");
  }
  const actor = requirePlayer(state, command.playerId);
  const cardIndex = actor.hand.findIndex((card) => card.id === command.cardId);
  if (cardIndex < 0) throw new GameRuleError("存在しないカードです", "CARD_NOT_FOUND");
  const card = actor.hand[cardIndex]!;
  if (card.type === "HERO") {
    throw new GameRuleError("英雄は自分から場に出せません", "HERO_UNPLAYABLE");
  }
  actor.hand.splice(cardIndex, 1);
  actor.discards.push(card);
  state.phase = "RESOLVING";
  addLog(state, `${actor.nickname}が${CARD_BY_TYPE[card.type].displayName}を出しました`);

  if (card.type === "BOY") {
    state.boyPlayedCount += 1;
    if (state.boyPlayedCount === 1) {
      addLog(state, "最初の少年は静かに場へ出ました");
      finishTurn(state, random);
      return;
    }
    setTargetPrompt(state, actor.id, "BOY", card.id, random);
    return;
  }
  if (TARGET_EFFECTS.has(card.type as TargetEffect)) {
    setTargetPrompt(state, actor.id, card.type as TargetEffect, card.id, random);
    return;
  }
  if (card.type === "SAGE") {
    actor.sagePending = true;
    addLog(state, `${actor.nickname}は次の手番の選択に備えています`);
  } else if (card.type === "MAIDEN") {
    actor.isProtected = true;
    addLog(state, `${actor.nickname}は守護に包まれました`);
  }
  finishTurn(state, random);
}

function resolvePublicExecutionTarget(
  state: GameState,
  actor: PlayerState,
  target: PlayerState,
  source: "EMPEROR" | "BOY",
  random: RandomSource,
): void {
  if (target.isProtected) {
    addLog(state, `${target.nickname}への効果は守護により無効になりました`);
    finishTurn(state, random);
    return;
  }
  const drawn = drawCard(state);
  if (!drawn) {
    addLog(state, "山札がないため公開処刑は不発でした");
    finishTurn(state, random);
    return;
  }
  target.hand.push(drawn);
  state.pendingAction = {
    kind: "PUBLIC_EXECUTION",
    actorId: actor.id,
    targetPlayerId: target.id,
    source,
    cards: [...target.hand],
  };
  state.phase = "WAITING_FOR_PUBLIC_EXECUTION_CHOICE";
  addLog(state, `${target.nickname}の2枚が公開されました`);
}

function selectTarget(
  state: GameState,
  command: Extract<GameCommand, { type: "SELECT_TARGET" }>,
  random: RandomSource,
): void {
  if (state.phase !== "WAITING_FOR_TARGET" || state.pendingAction?.kind !== "TARGET") {
    throw new GameRuleError("現在は対象を選べません", "WRONG_PHASE");
  }
  const pending = state.pendingAction;
  if (pending.actorId !== command.playerId || state.currentPlayerId !== command.playerId) {
    throw new GameRuleError("この選択を行う権限がありません", "NOT_ACTOR");
  }
  const actor = requirePlayer(state, command.playerId);
  const target = requirePlayer(state, command.targetPlayerId);
  if (!target.isAlive || target.id === actor.id) {
    throw new GameRuleError("対象プレイヤーが見つかりません", "INVALID_TARGET");
  }

  if (pending.effect === "EMPEROR" || pending.effect === "BOY") {
    resolvePublicExecutionTarget(state, actor, target, pending.effect, random);
    return;
  }
  if (target.isProtected) {
    addLog(state, `${target.nickname}への効果は守護により無効になりました`);
    finishTurn(state, random);
    return;
  }

  if (pending.effect === "SPIRIT") {
    const actorCard = actor.hand[0];
    const targetCard = target.hand[0];
    if (actorCard && targetCard) {
      actor.hand = [targetCard];
      target.hand = [actorCard];
      addLog(state, `${actor.nickname}と${target.nickname}が手札を交換しました`);
    }
    finishTurn(state, random);
    return;
  }
  if (pending.effect === "NOBLE") {
    const actorRank = actor.hand[0]?.rank ?? -1;
    const targetRank = target.hand[0]?.rank ?? -1;
    if (actorRank === targetRank) {
      eliminatePlayers(state, [
        { playerId: actor.id, reason: "対決が同値でした" },
        { playerId: target.id, reason: "対決が同値でした" },
      ]);
    } else {
      const loser = actorRank < targetRank ? actor : target;
      eliminatePlayers(state, [{ playerId: loser.id, reason: "対決に敗れました" }]);
    }
    finishTurn(state, random);
    return;
  }
  if (pending.effect === "DEATH") {
    const drawn = drawCard(state);
    if (!drawn) {
      addLog(state, "山札がないため疫病は不発でした");
      finishTurn(state, random);
      return;
    }
    target.hand.push(drawn);
    const shuffled = shuffle(target.hand, random);
    const first = shuffled[0];
    const second = shuffled[1];
    if (!first || !second) throw new GameRuleError("疫病の処理に失敗しました", "DEATH_FAILED");
    target.hand = shuffled;
    state.pendingAction = {
      kind: "DEATH",
      actorId: actor.id,
      targetPlayerId: target.id,
      cards: [first, second],
    };
    state.phase = "WAITING_FOR_DEATH_CHOICE";
    addLog(state, `${actor.nickname}が疫病のA・Bを選びます`);
    return;
  }
  if (pending.effect === "SEER") {
    const seen = target.hand[0];
    if (seen) actor.privatePeek = { playerId: target.id, card: seen };
    addLog(state, `${actor.nickname}が${target.nickname}を透視しました`);
    finishTurn(state, random);
    return;
  }
  if (pending.effect === "SOLDIER") {
    state.pendingAction = {
      kind: "GUESS",
      actorId: actor.id,
      targetPlayerId: target.id,
      sourceCardId: pending.sourceCardId,
    };
    state.phase = "WAITING_FOR_GUESS";
  }
}

function selectGuess(
  state: GameState,
  command: Extract<GameCommand, { type: "SELECT_GUESS" }>,
  random: RandomSource,
): void {
  if (state.phase !== "WAITING_FOR_GUESS" || state.pendingAction?.kind !== "GUESS") {
    throw new GameRuleError("現在は宣言できません", "WRONG_PHASE");
  }
  const pending = state.pendingAction;
  if (pending.actorId !== command.playerId) {
    throw new GameRuleError("この宣言を行う権限がありません", "NOT_ACTOR");
  }
  if (!Number.isInteger(command.guessRank) || command.guessRank < 1 || command.guessRank > 10) {
    throw new GameRuleError("宣言するランクが不正です", "INVALID_GUESS");
  }
  const actor = requirePlayer(state, command.playerId);
  const target = requirePlayer(state, pending.targetPlayerId);
  const matched = target.hand[0]?.rank === command.guessRank;
  addLog(
    state,
    `${actor.nickname}が${target.nickname}の手札をランク${command.guessRank}と宣言し、${matched ? "的中しました" : "外れました"}`,
  );
  if (matched) {
    const discarded = target.hand.shift();
    if (discarded) target.discards.push(discarded);
    if (discarded?.type === "HERO") {
      resolveHeroDiscard({ sourceEffect: "SOLDIER", playerId: target.id, state });
    } else {
      eliminatePlayers(state, [{ playerId: target.id, reason: "捜査で手札を言い当てられました" }]);
    }
  }
  finishTurn(state, random);
}

function selectPublicExecutionCard(
  state: GameState,
  command: Extract<GameCommand, { type: "SELECT_PUBLIC_EXECUTION_CARD" }>,
  random: RandomSource,
): void {
  if (
    state.phase !== "WAITING_FOR_PUBLIC_EXECUTION_CHOICE" ||
    state.pendingAction?.kind !== "PUBLIC_EXECUTION"
  ) {
    throw new GameRuleError("現在は公開処刑のカードを選べません", "WRONG_PHASE");
  }
  const pending = state.pendingAction;
  if (pending.actorId !== command.playerId) {
    throw new GameRuleError("このカードを選ぶ権限がありません", "NOT_ACTOR");
  }
  const target = requirePlayer(state, pending.targetPlayerId);
  const index = target.hand.findIndex((card) => card.id === command.cardId);
  if (index < 0 || !pending.cards.some((card) => card.id === command.cardId)) {
    throw new GameRuleError("存在しないカードです", "CARD_NOT_FOUND");
  }
  const [discarded] = target.hand.splice(index, 1);
  if (!discarded) throw new GameRuleError("カードを捨てられません", "DISCARD_FAILED");
  target.discards.push(discarded);
  addLog(state, `${target.nickname}の${CARD_BY_TYPE[discarded.type].displayName}が処刑されました`);
  if (discarded.type === "HERO") {
    resolveHeroDiscard({ sourceEffect: pending.source, playerId: target.id, state });
  }
  finishTurn(state, random);
}

function selectDeathCard(
  state: GameState,
  command: Extract<GameCommand, { type: "SELECT_DEATH_CARD" }>,
  random: RandomSource,
): void {
  if (state.phase !== "WAITING_FOR_DEATH_CHOICE" || state.pendingAction?.kind !== "DEATH") {
    throw new GameRuleError("現在は疫病のカードを選べません", "WRONG_PHASE");
  }
  const pending = state.pendingAction;
  if (pending.actorId !== command.playerId) {
    throw new GameRuleError("このカードを選ぶ権限がありません", "NOT_ACTOR");
  }
  const target = requirePlayer(state, pending.targetPlayerId);
  const discarded = pending.cards[command.position === "A" ? 0 : 1];
  const index = target.hand.findIndex((card) => card.id === discarded.id);
  if (index < 0) throw new GameRuleError("存在しないカードです", "CARD_NOT_FOUND");
  target.hand.splice(index, 1);
  target.discards.push(discarded);
  addLog(
    state,
    `${target.nickname}は疫病により${CARD_BY_TYPE[discarded.type].displayName}を失いました`,
  );
  if (discarded.type === "HERO") {
    resolveHeroDiscard({ sourceEffect: "DEATH", playerId: target.id, state });
  }
  finishTurn(state, random);
}

function selectSageCard(
  state: GameState,
  command: Extract<GameCommand, { type: "SELECT_SAGE_CARD" }>,
  random: RandomSource,
): void {
  if (state.phase !== "WAITING_FOR_SAGE_CHOICE" || state.pendingAction?.kind !== "SAGE") {
    throw new GameRuleError("現在は賢者のカードを選べません", "WRONG_PHASE");
  }
  const pending = state.pendingAction;
  if (pending.actorId !== command.playerId) {
    throw new GameRuleError("このカードを選ぶ権限がありません", "NOT_ACTOR");
  }
  const selected = pending.candidates.find((card) => card.id === command.cardId);
  if (!selected) throw new GameRuleError("候補にないカードです", "CARD_NOT_FOUND");
  const actor = requirePlayer(state, command.playerId);
  actor.hand.push(selected);
  const returned = pending.candidates.filter((card) => card.id !== selected.id);
  state.deck = shuffle([...state.deck, ...returned], random);
  state.pendingAction = null;
  state.phase = "WAITING_FOR_PLAY";
  addLog(state, `${actor.nickname}が賢者の選択を終えました`);
}

export function applyCommand(
  inputState: GameState,
  command: GameCommand,
  random: RandomSource = new CryptoRandomSource(),
): ApplyCommandResult {
  if (inputState.phase === "FINISHED") {
    throw new GameRuleError("このゲームは終了しています", "GAME_FINISHED");
  }
  if (inputState.processedCommandIds.includes(command.commandId)) {
    throw new GameRuleError("同じ操作が二重送信されました", "DUPLICATE_COMMAND");
  }
  const state = cloneState(inputState);
  const priorLogCount = state.logs.length;
  switch (command.type) {
    case "PLAY_CARD":
      playCard(state, command, random);
      break;
    case "SELECT_TARGET":
      selectTarget(state, command, random);
      break;
    case "SELECT_GUESS":
      selectGuess(state, command, random);
      break;
    case "SELECT_PUBLIC_EXECUTION_CARD":
      selectPublicExecutionCard(state, command, random);
      break;
    case "SELECT_DEATH_CARD":
      selectDeathCard(state, command, random);
      break;
    case "SELECT_SAGE_CARD":
      selectSageCard(state, command, random);
      break;
  }
  state.processedCommandIds.push(command.commandId);
  if (state.processedCommandIds.length > 200) state.processedCommandIds.shift();
  return {
    state,
    events: state.logs.slice(priorLogCount).map((log) => ({ type: "LOG", message: log.message })),
  };
}

function legalTargets(state: GameState, viewerPlayerId: string): string[] {
  if (
    state.phase !== "WAITING_FOR_TARGET" ||
    state.pendingAction?.kind !== "TARGET" ||
    state.pendingAction.actorId !== viewerPlayerId
  ) {
    return [];
  }
  return state.players
    .filter((player) => player.isAlive && player.id !== viewerPlayerId)
    .map((player) => player.id);
}

export function createPlayerView(state: GameState, viewerPlayerId: string): PlayerGameView {
  const viewer = requirePlayer(state, viewerPlayerId);
  const pending = state.pendingAction;
  const publicPending: PlayerGameView["pendingPublic"] =
    pending?.kind === "TARGET"
      ? { kind: "TARGET", effect: pending.effect }
      : pending?.kind === "GUESS"
        ? { kind: "GUESS", targetPlayerId: pending.targetPlayerId }
        : pending?.kind === "PUBLIC_EXECUTION"
          ? {
              kind: "PUBLIC_EXECUTION",
              targetPlayerId: pending.targetPlayerId,
              cards: pending.cards,
            }
          : pending?.kind === "DEATH"
            ? { kind: "DEATH", targetPlayerId: pending.targetPlayerId, positions: ["A", "B"] }
            : pending?.kind === "SAGE"
              ? { kind: "SAGE" }
              : null;

  return {
    gameId: state.id,
    phase: state.phase,
    currentPlayerId: state.currentPlayerId,
    turnNumber: state.turnNumber,
    deckCount: state.deck.length,
    reincarnationAvailable: Boolean(state.reincarnationCard) && !state.reincarnationUsed,
    boyPlayedCount: state.boyPlayedCount,
    players: state.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      nickname: player.nickname,
      isBot: player.isBot,
      isAlive: player.isAlive,
      isProtected: player.isProtected,
      connectionStatus: player.connectionStatus,
      discards: player.discards,
      ...(!player.isAlive || state.phase === "FINISHED" ? { revealedHand: player.hand } : {}),
      ...(player.eliminatedReason ? { eliminatedReason: player.eliminatedReason } : {}),
    })),
    selfPlayerId: viewerPlayerId,
    selfHand: viewer.hand,
    legalCardIds:
      state.phase === "WAITING_FOR_PLAY" && state.currentPlayerId === viewerPlayerId
        ? playableCards(viewer).map((card) => card.id)
        : [],
    legalTargetIds: legalTargets(state, viewerPlayerId),
    privateSageCandidates:
      pending?.kind === "SAGE" && pending.actorId === viewerPlayerId ? pending.candidates : [],
    privatePeek: viewer.privatePeek,
    privateDeathCards:
      pending?.kind === "DEATH" && pending.targetPlayerId === viewerPlayerId ? pending.cards : [],
    pendingPublic: publicPending,
    winnerIds: state.winnerIds,
    resultType: state.resultType,
    logs: state.logs,
  };
}

export function listLegalCommands(state: GameState, playerId: string): GameCommand[] {
  const view = createPlayerView(state, playerId);
  const commandId = (): string => globalThis.crypto.randomUUID();
  if (state.phase === "WAITING_FOR_PLAY" && state.currentPlayerId === playerId) {
    return view.legalCardIds.map((cardId) => ({
      type: "PLAY_CARD",
      commandId: commandId(),
      playerId,
      cardId,
    }));
  }
  if (state.pendingAction?.kind === "TARGET" && state.pendingAction.actorId === playerId) {
    return view.legalTargetIds.map((targetPlayerId) => ({
      type: "SELECT_TARGET",
      commandId: commandId(),
      playerId,
      targetPlayerId,
    }));
  }
  if (state.pendingAction?.kind === "GUESS" && state.pendingAction.actorId === playerId) {
    return Array.from({ length: 10 }, (_, index) => ({
      type: "SELECT_GUESS" as const,
      commandId: commandId(),
      playerId,
      guessRank: index + 1,
    }));
  }
  if (
    state.pendingAction?.kind === "PUBLIC_EXECUTION" &&
    state.pendingAction.actorId === playerId
  ) {
    return state.pendingAction.cards.map((card) => ({
      type: "SELECT_PUBLIC_EXECUTION_CARD",
      commandId: commandId(),
      playerId,
      cardId: card.id,
    }));
  }
  if (state.pendingAction?.kind === "DEATH" && state.pendingAction.actorId === playerId) {
    return (["A", "B"] as const).map((position) => ({
      type: "SELECT_DEATH_CARD",
      commandId: commandId(),
      playerId,
      position,
    }));
  }
  if (state.pendingAction?.kind === "SAGE" && state.pendingAction.actorId === playerId) {
    return state.pendingAction.candidates.map((card) => ({
      type: "SELECT_SAGE_CARD",
      commandId: commandId(),
      playerId,
      cardId: card.id,
    }));
  }
  return [];
}
