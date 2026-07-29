"use client";

import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameCommand } from "@tenfold/game-engine";
import { CARD_BY_RANK } from "@tenfold/game-engine";
import type { CardInstance, PlayerGameView } from "@tenfold/shared";
import { CardBack, GameCard } from "./card";
import { CardSigil } from "./sigil";
import { getSoundEnabled, playEffect, saveSoundEnabled } from "@/lib/preferences";

interface GameBoardProps {
  view: PlayerGameView;
  onCommand: (command: GameCommand) => void;
  onRematch: () => void;
  onExit: () => void;
  connectionLabel?: string;
  error?: string;
}

type Selection =
  | { kind: "CARD"; value: string }
  | { kind: "TARGET"; value: string }
  | { kind: "GUESS"; value: number }
  | { kind: "EXECUTION"; value: string }
  | { kind: "DEATH"; value: "A" | "B" }
  | { kind: "SAGE"; value: string }
  | null;

interface PlayedCardMoment {
  card: CardInstance;
  playerName: string;
  isSelf: boolean;
  turn: number;
}

interface DuelOutcome {
  contestants: [string, string];
  winner: string | null;
}

type PresentationEvent =
  | {
      kind: "CARD";
      id: string;
      moment: PlayedCardMoment;
    }
  | {
      kind: "EFFECT";
      id: string;
      message: string;
      sourceCard: CardInstance | null;
      duel: DuelOutcome | null;
    };

interface EffectNotice {
  id: string;
  message: string;
  sourceCard: CardInstance | null;
  duel: DuelOutcome | null;
}

const TURN_ANNOUNCEMENT_MS = 1800;
const PLAYED_CARD_VISIBLE_MS = 3000;
const EFFECT_NOTICE_VISIBLE_MS = 3600;
const DUEL_NOTICE_VISIBLE_MS = 4800;

function playedCardFromLog(
  view: PlayerGameView,
  message: string,
  turn: number,
): PlayedCardMoment | null {
  const definitions = Object.values(CARD_BY_RANK);
  const players = [...view.players].sort(
    (left, right) => right.nickname.length - left.nickname.length,
  );

  for (const player of players) {
    const definition = definitions.find(
      (candidate) => message === `${player.nickname}が${candidate.displayName}を出しました`,
    );
    if (!definition) continue;
    const card = [...player.discards]
      .reverse()
      .find((candidate) => candidate.rank === definition.rank);
    if (!card) return null;
    return {
      card,
      playerName: player.id === view.selfPlayerId ? "あなた" : player.nickname,
      isSelf: player.id === view.selfPlayerId,
      turn,
    };
  }

  return null;
}

function parseDuelOutcome(message: string): DuelOutcome | null {
  const prefix = "貴族の対決：";
  if (!message.startsWith(prefix)) return null;
  const [matchup, result] = message.slice(prefix.length).split(" — ");
  const contestants = matchup?.split(" VS ");
  if (!result || contestants?.length !== 2) return null;
  return {
    contestants: [contestants[0]!, contestants[1]!],
    winner: result === "DRAW" ? null : result.endsWith(" WIN") ? result.slice(0, -4) : null,
  };
}

function isGenericResult(message: string): boolean {
  return (
    message.endsWith("の手番です") ||
    message.endsWith("の勝利です") ||
    message.includes("が脱落しました")
  );
}

function commandForSelection(view: PlayerGameView, selection: Selection): GameCommand | null {
  if (!selection) return null;
  const base = { commandId: crypto.randomUUID(), playerId: view.selfPlayerId };
  switch (selection.kind) {
    case "CARD":
      return { type: "PLAY_CARD", ...base, cardId: selection.value };
    case "TARGET":
      return { type: "SELECT_TARGET", ...base, targetPlayerId: selection.value };
    case "GUESS":
      return { type: "SELECT_GUESS", ...base, guessRank: selection.value };
    case "EXECUTION":
      return { type: "SELECT_PUBLIC_EXECUTION_CARD", ...base, cardId: selection.value };
    case "DEATH":
      return { type: "SELECT_DEATH_CARD", ...base, position: selection.value };
    case "SAGE":
      return { type: "SELECT_SAGE_CARD", ...base, cardId: selection.value };
  }
}

export function GameBoard({
  view,
  onCommand,
  onRematch,
  onExit,
  connectionLabel = "接続中",
  error,
}: GameBoardProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [turnAnnouncement, setTurnAnnouncement] = useState<{
    label: string;
    self: boolean;
    turn: number;
  } | null>(null);
  const [presentationQueue, setPresentationQueue] = useState<PresentationEvent[]>([]);
  const [showResultOverlay, setShowResultOverlay] = useState(view.phase === "FINISHED");
  const [drawAnimationKey, setDrawAnimationKey] = useState(0);
  const rulesDialog = useRef<HTMLDialogElement>(null);
  const logList = useRef<HTMLOListElement>(null);
  const previousDeckCount = useRef<number | null>(null);
  const previousLogCount = useRef<number | null>(null);
  const activeSourceCard = useRef<PlayedCardMoment | null>(null);
  const isSelfTurn = view.currentPlayerId === view.selfPlayerId;
  const self = view.players.find((player) => player.id === view.selfPlayerId);
  const opponents = view.players.filter((player) => player.id !== view.selfPlayerId);
  const current = view.players.find((player) => player.id === view.currentPlayerId);
  const activePresentation = presentationQueue[0] ?? null;
  const playedCard = activePresentation?.kind === "CARD" ? activePresentation.moment : null;
  const effectNotice: EffectNotice | null =
    activePresentation?.kind === "EFFECT" ? activePresentation : null;

  useEffect(() => {
    setSoundEnabled(getSoundEnabled());
  }, []);
  useLayoutEffect(() => {
    const scrollToTop = () => {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = previousBehavior;
    };
    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    const timer = window.setTimeout(scrollToTop, 60);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    setSelection(null);
  }, [view.phase, view.turnNumber]);
  useEffect(() => {
    previousLogCount.current = null;
    previousDeckCount.current = null;
    activeSourceCard.current = null;
    setPresentationQueue([]);
    setShowResultOverlay(view.phase === "FINISHED");
  }, [view.gameId]);
  useEffect(() => {
    logList.current?.scrollTo({
      top: logList.current.scrollHeight,
      behavior: "smooth",
    });
  }, [view.logs.length]);
  useEffect(() => {
    if (view.phase === "FINISHED") playEffect("win", soundEnabled);
  }, [view.phase, soundEnabled]);
  useEffect(() => {
    if (view.phase === "FINISHED" || presentationQueue.length > 0) {
      setTurnAnnouncement(null);
      return;
    }
    setTurnAnnouncement({
      label: isSelfTurn ? "あなたの手番" : `${current?.nickname ?? "相手"}の手番`,
      self: isSelfTurn,
      turn: view.turnNumber,
    });
    const timer = window.setTimeout(() => setTurnAnnouncement(null), TURN_ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [
    current?.nickname,
    isSelfTurn,
    presentationQueue.length,
    view.currentPlayerId,
    view.phase,
    view.turnNumber,
  ]);
  useEffect(() => {
    const previous = previousLogCount.current;
    previousLogCount.current = view.logs.length;
    if (previous === null || previous > view.logs.length) return;

    const newEntries = view.logs.slice(previous);
    const queued: PresentationEvent[] = [];
    const playedEntries = new Set<string>();

    for (const entry of newEntries) {
      const moment = playedCardFromLog(view, entry.message, entry.turn);
      if (!moment) continue;
      activeSourceCard.current = moment;
      playedEntries.add(entry.id);
      queued.push({ kind: "CARD", id: `card-${entry.id}`, moment });
    }

    const candidates = newEntries.filter(
      (entry) => !playedEntries.has(entry.id) && !entry.message.endsWith("の手番です"),
    );
    const highlighted =
      candidates.find((entry) => entry.message.startsWith("貴族の対決：")) ??
      [...candidates].reverse().find((entry) => !isGenericResult(entry.message)) ??
      candidates.at(-1);

    if (highlighted) {
      queued.push({
        kind: "EFFECT",
        id: `effect-${highlighted.id}`,
        message: highlighted.message,
        sourceCard: activeSourceCard.current?.card ?? null,
        duel: parseDuelOutcome(highlighted.message),
      });
    }

    if (queued.length > 0) {
      setPresentationQueue((currentQueue) => [...currentQueue, ...queued]);
    }
  }, [view.logs]);
  useEffect(() => {
    if (!activePresentation) return;
    const duration =
      activePresentation.kind === "CARD"
        ? PLAYED_CARD_VISIBLE_MS
        : activePresentation.duel
          ? DUEL_NOTICE_VISIBLE_MS
          : EFFECT_NOTICE_VISIBLE_MS;
    const timer = window.setTimeout(
      () => setPresentationQueue((currentQueue) => currentQueue.slice(1)),
      duration,
    );
    return () => window.clearTimeout(timer);
  }, [activePresentation]);
  useEffect(() => {
    if (view.phase !== "FINISHED") {
      setShowResultOverlay(false);
      return;
    }
    if (presentationQueue.length > 0) {
      setShowResultOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => setShowResultOverlay(true), 450);
    return () => window.clearTimeout(timer);
  }, [presentationQueue.length, view.phase]);
  useEffect(() => {
    if (previousDeckCount.current !== null && view.deckCount < previousDeckCount.current) {
      setDrawAnimationKey((key) => key + 1);
    }
    previousDeckCount.current = view.deckCount;
  }, [view.deckCount]);

  const submit = () => {
    const command = commandForSelection(view, selection);
    if (!command) return;
    playEffect("play", soundEnabled);
    onCommand(command);
    setSelection(null);
  };

  const prompt = (() => {
    if (!isSelfTurn || view.phase === "FINISHED") return null;
    if (view.phase === "WAITING_FOR_PLAY") return "手札から出すカードを選んでください";
    if (view.phase === "WAITING_FOR_TARGET") return "効果の対象を選んでください";
    if (view.phase === "WAITING_FOR_GUESS") return "相手の手札ランクを宣言してください";
    if (view.phase === "WAITING_FOR_PUBLIC_EXECUTION_CHOICE")
      return "捨てさせるカードを選んでください";
    if (view.phase === "WAITING_FOR_DEATH_CHOICE") return "伏せ札A・Bのどちらかを選んでください";
    if (view.phase === "WAITING_FOR_SAGE_CHOICE") return "手札へ加えるカードを選んでください";
    return "効果を解決しています";
  })();

  const selectedLabel = (() => {
    if (!selection) return "";
    if (selection.kind === "CARD") {
      const card = view.selfHand.find((candidate) => candidate.id === selection.value);
      return card ? `「${CARD_BY_RANK[card.rank]!.displayName}」` : "選択したカード";
    }
    if (selection.kind === "TARGET") {
      return (
        view.players.find((player) => player.id === selection.value)?.nickname ?? "選択した相手"
      );
    }
    if (selection.kind === "GUESS") {
      return `ランク${selection.value}「${CARD_BY_RANK[selection.value]!.displayName}」`;
    }
    if (selection.kind === "EXECUTION") {
      const card =
        view.pendingPublic?.kind === "PUBLIC_EXECUTION"
          ? view.pendingPublic.cards.find((candidate) => candidate.id === selection.value)
          : null;
      return card ? `「${CARD_BY_RANK[card.rank]!.displayName}」` : "選択したカード";
    }
    if (selection.kind === "DEATH") return `伏せ札 ${selection.value}`;
    const card = view.privateSageCandidates.find((candidate) => candidate.id === selection.value);
    return card ? `「${CARD_BY_RANK[card.rank]!.displayName}」` : "選択したカード";
  })();

  const confirmLabel = (() => {
    if (!selection) return "この選択で確定";
    if (selection.kind === "CARD") return "このカードを出す";
    if (selection.kind === "TARGET") return "この相手に決める";
    if (selection.kind === "GUESS") return "このランクを宣言";
    if (selection.kind === "EXECUTION") return "このカードを捨てさせる";
    if (selection.kind === "DEATH") return "この伏せ札を選ぶ";
    return "このカードを手札へ";
  })();

  return (
    <section
      className={`game-screen phase-${view.phase.toLowerCase()}`}
      aria-label="TENFOLD 対戦画面"
    >
      <div className="game-topbar">
        <div
          className="turn-indicator turn-enter"
          key={`${view.turnNumber}-${view.currentPlayerId}`}
          aria-live="polite"
        >
          <span className={isSelfTurn ? "pulse-dot" : ""} />
          <div>
            <small>TURN {view.turnNumber}</small>
            <strong>{isSelfTurn ? "あなたの手番" : `${current?.nickname ?? "相手"}の手番`}</strong>
          </div>
        </div>
        <div className="game-tools">
          <span className="connection-badge">
            <i /> {connectionLabel}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              saveSoundEnabled(next);
            }}
            aria-label={`効果音を${soundEnabled ? "オフ" : "オン"}にする`}
          >
            {soundEnabled ? "♪" : "×"}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => rulesDialog.current?.showModal()}
          >
            ルール
          </button>
        </div>
      </div>

      {turnAnnouncement && (
        <div
          className={`turn-announcement ${turnAnnouncement.self ? "is-self" : ""}`}
          key={`${turnAnnouncement.turn}-${turnAnnouncement.label}`}
          aria-hidden="true"
        >
          <span>TURN SHIFT · {turnAnnouncement.turn}</span>
          <strong>{turnAnnouncement.label}</strong>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {effectNotice && (
        <div
          className={`effect-notice ${
            effectNotice.sourceCard ? `effect-${effectNotice.sourceCard.type.toLowerCase()}` : ""
          } ${effectNotice.duel ? "is-duel" : ""}`}
          key={effectNotice.id}
          role="status"
          aria-live="polite"
        >
          <span className="effect-wave effect-wave-a" aria-hidden="true" />
          <span className="effect-wave effect-wave-b" aria-hidden="true" />
          {effectNotice.sourceCard && (
            <div className="effect-sigil" aria-hidden="true">
              <CardSigil type={effectNotice.sourceCard.type} />
            </div>
          )}
          <div className="effect-notice-copy">
            <small>
              {effectNotice.sourceCard
                ? `${CARD_BY_RANK[effectNotice.sourceCard.rank]?.effectName} · 効果結果`
                : "EFFECT RESOLVED"}
            </small>
            {effectNotice.duel ? (
              <>
                <strong className="duel-title">貴族の対決</strong>
                <div className="duel-contestants" aria-label={effectNotice.message}>
                  {effectNotice.duel.contestants.map((name, index) => {
                    const isWinner = effectNotice.duel?.winner === name;
                    return (
                      <span
                        className={
                          effectNotice.duel?.winner
                            ? isWinner
                              ? "is-winner"
                              : "is-loser"
                            : "is-draw"
                        }
                        key={`${name}-${index}`}
                      >
                        <b>{name}</b>
                        <em>{effectNotice.duel?.winner ? (isWinner ? "WIN" : "LOSE") : "DRAW"}</em>
                      </span>
                    );
                  })}
                  <i>VS</i>
                </div>
                <p className="duel-verdict">
                  {effectNotice.duel.winner
                    ? `${effectNotice.duel.winner}の勝利`
                    : "同値のため両者脱落"}
                </p>
              </>
            ) : (
              <strong>{effectNotice.message}</strong>
            )}
          </div>
        </div>
      )}

      {playedCard && (
        <div
          className={`played-card-stage ${playedCard.isSelf ? "is-self-play" : "is-opponent-play"}`}
          key={`${playedCard.card.id}-${playedCard.turn}`}
          role="status"
          aria-live="polite"
          aria-label={`${playedCard.playerName}が${CARD_BY_RANK[playedCard.card.rank]?.displayName}を使用`}
        >
          <span className="play-side-label">
            {playedCard.isSelf ? "YOUR PLAY" : "OPPONENT PLAY"}
          </span>
          <span className="cast-ring cast-ring-a" aria-hidden="true" />
          <span className="cast-ring cast-ring-b" aria-hidden="true" />
          <GameCard card={playedCard.card} />
          <div className="played-card-label">
            <small>{playedCard.playerName}が使用</small>
            <strong>
              {CARD_BY_RANK[playedCard.card.rank]?.displayName} ·{" "}
              {CARD_BY_RANK[playedCard.card.rank]?.effectName}
            </strong>
            <span>{CARD_BY_RANK[playedCard.card.rank]?.description}</span>
          </div>
        </div>
      )}

      <div className="game-layout">
        <div className="table-zone">
          <div className="table-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className={`opponents opponents-${opponents.length}`}>
            {opponents.map((player) => {
              const isTargetable =
                isSelfTurn &&
                view.phase === "WAITING_FOR_TARGET" &&
                view.legalTargetIds.includes(player.id);
              const isTargetSelected =
                selection?.kind === "TARGET" && selection.value === player.id;
              return (
                <article
                  className={`opponent ${!player.isAlive ? "is-eliminated" : ""} ${
                    player.id === view.currentPlayerId ? "is-current" : ""
                  } ${player.isProtected ? "is-protected" : ""} ${
                    isTargetable ? "is-targetable" : ""
                  } ${isTargetSelected ? "is-target-selected" : ""}`}
                  key={player.id}
                >
                  <div className="player-avatar" aria-hidden="true">
                    {player.isBot ? "CPU" : player.nickname.slice(0, 1)}
                  </div>
                  <div className="player-name">
                    <strong>{player.nickname}</strong>
                    <small>
                      {player.isAlive
                        ? player.isProtected
                          ? "守護中"
                          : player.connectionStatus === "DISCONNECTED"
                            ? "切断中"
                            : "生存"
                        : "脱落"}
                    </small>
                  </div>
                  {player.isAlive && <CardBack label="手札 1枚" />}
                  <div
                    className="mini-discards"
                    aria-label={`${player.nickname}が場に出したカード`}
                  >
                    <span>場札 {player.discards.length}枚</span>
                    <div>
                      {player.discards.map((card, index) => (
                        <GameCard card={card} compact motionIndex={index} key={card.id} />
                      ))}
                    </div>
                  </div>
                  {player.isProtected && <span className="shield-badge">守護</span>}
                  {isTargetable && (
                    <div className="target-list opponent-target-overlay">
                      <button
                        className={isTargetSelected ? "selected" : ""}
                        type="button"
                        aria-pressed={isTargetSelected}
                        onClick={() => setSelection({ kind: "TARGET", value: player.id })}
                      >
                        <span>
                          {isTargetSelected
                            ? "✓ 選択中"
                            : player.isProtected
                              ? "守護中でも対象にする"
                              : "この相手を選ぶ"}
                        </span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {drawAnimationKey > 0 && (
            <span className="draw-flight" key={drawAnimationKey} aria-hidden="true">
              <i />
            </span>
          )}

          <div className="table-center">
            <div className="deck-stack">
              <CardBack label={`山札 残り${view.deckCount}枚`} />
              <b className="deck-count-pop" key={view.deckCount}>
                {view.deckCount}
              </b>
            </div>
            <div className="seal-card">
              <CardBack label={view.reincarnationAvailable ? "転生札" : "使用済み"} />
              <span>{view.reincarnationAvailable ? "転生札" : "封印は解かれた"}</span>
            </div>
            <div className="center-status">
              <small>CURRENT PHASE</small>
              <strong>{prompt ?? `${current?.nickname ?? "相手"}が思考中…`}</strong>
              <span>少年 {view.boyPlayedCount}/2</span>
            </div>
          </div>

          <div className={`self-area ${self?.isProtected ? "is-protected" : ""}`}>
            <div className="self-status">
              <div>
                <small>YOUR HAND</small>
                <strong>{self?.nickname}</strong>
              </div>
              <span>{self?.isProtected ? "◇ 守護中" : "生存"}</span>
            </div>

            <div className="self-field-history" aria-label="あなたが場に出したカード">
              <span>YOUR FIELD · 場札 {self?.discards.length ?? 0}枚</span>
              <div>
                {self?.discards.map((card, index) => (
                  <GameCard card={card} compact motionIndex={index} key={card.id} />
                ))}
                {self?.discards.length === 0 && <small>カードを出すとここに残ります</small>}
              </div>
            </div>

            {view.phase === "WAITING_FOR_SAGE_CHOICE" && isSelfTurn ? (
              <div className="choice-cards" aria-label="賢者の候補">
                {view.privateSageCandidates.map((card, index) => (
                  <GameCard
                    card={card}
                    key={card.id}
                    motionIndex={index}
                    selected={selection?.kind === "SAGE" && selection.value === card.id}
                    onClick={() => setSelection({ kind: "SAGE", value: card.id })}
                  />
                ))}
              </div>
            ) : (
              <div className="hand-cards" aria-label="自分の手札">
                {view.selfHand.map((card, index) => (
                  <GameCard
                    card={card}
                    key={card.id}
                    motionIndex={index}
                    selected={selection?.kind === "CARD" && selection.value === card.id}
                    disabled={!view.legalCardIds.includes(card.id)}
                    onClick={() => setSelection({ kind: "CARD", value: card.id })}
                  />
                ))}
              </div>
            )}

            {isSelfTurn && view.phase !== "FINISHED" && (
              <section
                className={`action-dock ${selection ? "has-selection" : ""}`}
                aria-label="現在の操作"
              >
                <div className="action-dock-heading">
                  <span className="action-step" aria-hidden="true">
                    {selection ? "02" : "01"}
                  </span>
                  <div>
                    <small>{selection ? "READY TO CONFIRM" : "YOUR ACTION"}</small>
                    <strong>{prompt ?? "効果を解決しています"}</strong>
                  </div>
                </div>

                {view.phase === "WAITING_FOR_PLAY" && !selection && (
                  <p className="action-dock-hint">上のカードを1枚タップしてください</p>
                )}

                {view.phase === "WAITING_FOR_TARGET" && !selection && (
                  <p className="action-dock-hint">盤面上の相手を直接タップしてください</p>
                )}

                {view.phase === "WAITING_FOR_GUESS" && (
                  <div className="rank-picker action-rank-picker" aria-label="宣言するランク">
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((rank) => (
                      <button
                        type="button"
                        className={
                          selection?.kind === "GUESS" && selection.value === rank ? "selected" : ""
                        }
                        onClick={() => setSelection({ kind: "GUESS", value: rank })}
                        key={rank}
                        aria-label={`ランク${rank} ${CARD_BY_RANK[rank]!.displayName}と宣言`}
                      >
                        <b>{rank}</b>
                        <small>{CARD_BY_RANK[rank]!.displayName}</small>
                      </button>
                    ))}
                  </div>
                )}

                {view.phase === "WAITING_FOR_PUBLIC_EXECUTION_CHOICE" &&
                  view.pendingPublic?.kind === "PUBLIC_EXECUTION" && (
                    <div className="choice-cards compact-choice">
                      {view.pendingPublic.cards.map((card, index) => (
                        <GameCard
                          card={card}
                          compact
                          motionIndex={index}
                          key={card.id}
                          selected={selection?.kind === "EXECUTION" && selection.value === card.id}
                          onClick={() => setSelection({ kind: "EXECUTION", value: card.id })}
                        />
                      ))}
                    </div>
                  )}

                {view.phase === "WAITING_FOR_DEATH_CHOICE" && (
                  <div className="death-choice">
                    {(["A", "B"] as const).map((position) => (
                      <button
                        type="button"
                        className={
                          selection?.kind === "DEATH" && selection.value === position
                            ? "selected"
                            : ""
                        }
                        onClick={() => setSelection({ kind: "DEATH", value: position })}
                        key={position}
                      >
                        <CardBack label={`伏せ札 ${position}`} />
                      </button>
                    ))}
                  </div>
                )}

                {view.phase === "WAITING_FOR_SAGE_CHOICE" && !selection && (
                  <p className="action-dock-hint">上の候補から手札へ加える1枚を選んでください</p>
                )}

                {selection && (
                  <div className="action-confirm">
                    <div className="action-selection">
                      <small>選択中</small>
                      <strong>{selectedLabel}</strong>
                    </div>
                    <button
                      className="button button-primary confirm-button"
                      type="button"
                      onClick={submit}
                      aria-label="この選択で確定"
                    >
                      {confirmLabel}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
              </section>
            )}

            {view.privatePeek && (
              <div className="private-note" role="status">
                透視結果：
                {view.players.find((player) => player.id === view.privatePeek?.playerId)?.nickname}
                の手札は「{CARD_BY_RANK[view.privatePeek.card.rank]!.displayName}」
              </div>
            )}
            {view.privateDeathCards.length > 0 && (
              <div className="private-note" role="status">
                あなたの伏せ札：
                {view.privateDeathCards
                  .map((card) => CARD_BY_RANK[card.rank]!.displayName)
                  .join("／")}
              </div>
            )}
          </div>
        </div>

        <aside className="game-sidebar">
          <div className="prompt-panel turn-guide">
            <small>TURN GUIDE</small>
            <h2>{prompt ?? "盤面を見守っています"}</h2>
            <div className="turn-flow" aria-hidden="true">
              <span className="is-complete">01 引く</span>
              <span className={isSelfTurn ? "is-active" : ""}>02 選ぶ</span>
              <span>03 効果</span>
            </div>
            {isSelfTurn && (
              <p className="turn-guide-note">
                操作ボタンは手札のすぐ下に表示されます。相手が複数いる場合、対象は盤面から直接選べます。
              </p>
            )}
            {!isSelfTurn && (
              <div className="thinking-line">
                <span /> 相手の選択を待っています
              </div>
            )}
          </div>

          <div className="game-log">
            <div className="panel-title">
              <span>ゲームログ</span>
              <small>{view.logs.length}件</small>
            </div>
            <ol ref={logList}>
              {view.logs.slice(-30).map((entry) => (
                <li key={entry.id}>
                  <span>{entry.turn}</span>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {view.phase === "FINISHED" && showResultOverlay && (
        <div
          className={`result-overlay ${
            view.winnerIds.includes(view.selfPlayerId) ? "is-victory" : "is-defeat"
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <div className="result-particles" aria-hidden="true">
            {Array.from({ length: 22 }, (_, index) => (
              <i key={index} style={{ "--particle-index": index } as CSSProperties} />
            ))}
          </div>
          <div className="result-panel">
            <p className="eyebrow">MATCH COMPLETE</p>
            <h2 id="result-title">
              {view.resultType === "DRAW"
                ? "引き分け"
                : view.winnerIds.includes(view.selfPlayerId)
                  ? "あなたの勝利"
                  : `${view.players.find((player) => view.winnerIds.includes(player.id))?.nickname ?? "相手"}の勝利`}
            </h2>
            <p>{view.turnNumber}ターンの心理戦が決着しました。</p>
            <div className="result-players">
              {view.players.map((player) => (
                <div key={player.id}>
                  <div className="result-player-summary">
                    <span>{player.nickname}</span>
                    <b>
                      {view.winnerIds.includes(player.id)
                        ? "WIN"
                        : player.isAlive
                          ? "SURVIVED"
                          : "OUT"}
                    </b>
                    <small>{player.eliminatedReason ?? "最終比較"}</small>
                  </div>
                  <div
                    className="result-field-history"
                    aria-label={`${player.nickname}が場に出したカード`}
                  >
                    {player.discards.map((card) => (
                      <GameCard card={card} compact key={card.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="result-actions">
              <button className="button button-primary" type="button" onClick={onRematch}>
                再戦する
              </button>
              <button className="button button-secondary" type="button" onClick={onExit}>
                退出する
              </button>
            </div>
          </div>
        </div>
      )}

      <dialog className="rules-dialog" ref={rulesDialog}>
        <button
          className="dialog-close"
          type="button"
          onClick={() => rulesDialog.current?.close()}
          aria-label="ルールを閉じる"
        >
          ×
        </button>
        <p className="eyebrow">QUICK RULES</p>
        <h2>手番では、引いてから1枚を出す。</h2>
        <ul>
          <li>英雄は自分から出せません。</li>
          <li>最後の生存者が勝者です。</li>
          <li>山札切れでは、残した手札の最高ランクが勝ちます。</li>
          <li>守護は次の自分の手番開始まで続きます。</li>
        </ul>
        <button
          className="button button-primary"
          type="button"
          onClick={() => rulesDialog.current?.close()}
        >
          対戦へ戻る
        </button>
      </dialog>
    </section>
  );
}
