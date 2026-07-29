"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { chooseBotCommand } from "@tenfold/bot";
import {
  applyCommand,
  createGame,
  createPlayerView,
  CryptoRandomSource,
  listLegalCommands,
  type GameCommand,
  type GameState,
} from "@tenfold/game-engine";
import type { BotLevel } from "@tenfold/shared";
import { GameBoard } from "./game-board";
import { getNickname, saveNickname } from "@/lib/preferences";

const HUMAN_ID = "local-human";
const random = new CryptoRandomSource();

function newCpuGame(nickname: string, botCount: number, level: BotLevel): GameState {
  return createGame(
    [
      { id: HUMAN_ID, nickname },
      ...Array.from({ length: botCount }, (_, index) => ({
        id: `local-bot-${index + 1}`,
        nickname: `CPU ${index + 1}`,
        isBot: true,
        botLevel: level,
      })),
    ],
    { random, firstPlayerIndex: 0 },
  );
}

export function CpuGame() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [botCount, setBotCount] = useState(1);
  const [level, setLevel] = useState<BotLevel>("NORMAL");
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setNickname(getNickname() || "旅人");
  }, []);

  useEffect(() => {
    if (!state || state.phase === "FINISHED") return;
    const bot = state.players.find((player) => player.id === state.currentPlayerId && player.isBot);
    if (!bot) return;
    const timer = window.setTimeout(
      () => {
        try {
          const legalCommands = listLegalCommands(state, bot.id);
          const command = chooseBotCommand({
            view: createPlayerView(state, bot.id),
            legalCommands,
            level: bot.botLevel ?? level,
            random,
          });
          setState(applyCommand(state, command, random).state);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "CPUの操作に失敗しました");
        }
      },
      380 + random.int(321),
    );
    return () => window.clearTimeout(timer);
  }, [state, level]);

  const view = useMemo(() => (state ? createPlayerView(state, HUMAN_ID) : null), [state]);

  const start = () => {
    const clean = nickname
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 16);
    if (!clean) {
      setError("ニックネームを入力してください");
      return;
    }
    saveNickname(clean);
    setError("");
    setState(newCpuGame(clean, botCount, level));
  };

  const command = (gameCommand: GameCommand) => {
    if (!state) return;
    try {
      setError("");
      setState(applyCommand(state, gameCommand, random).state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作を実行できませんでした");
    }
  };

  if (view && state) {
    return (
      <GameBoard
        view={view}
        onCommand={command}
        onRematch={() => setState(newCpuGame(nickname, botCount, level))}
        onExit={() => router.push("/play")}
        connectionLabel="ローカル対戦"
        error={error}
      />
    );
  }

  return (
    <section className="page-shell setup-shell">
      <div className="setup-intro">
        <p className="eyebrow">SOLO TABLE</p>
        <h1>静かな卓で、読みを磨く。</h1>
        <p>相手の人数と読みの深さを選んでください。設定は再戦時にも引き継がれます。</p>
      </div>
      <div className="setup-card">
        <label>
          <span>ニックネーム</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={16}
            autoComplete="nickname"
            placeholder="旅人"
          />
          <small>1〜16文字・この端末にだけ保存</small>
        </label>
        <fieldset>
          <legend>対戦人数</legend>
          <div className="segmented">
            {[1, 2, 3].map((count) => (
              <button
                type="button"
                className={botCount === count ? "selected" : ""}
                onClick={() => setBotCount(count)}
                key={count}
              >
                <b>{count + 1}人</b>
                <small>CPU {count}人</small>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>CPUの思考レベル</legend>
          <div className="segmented two">
            <button
              type="button"
              className={level === "EASY" ? "selected" : ""}
              onClick={() => setLevel("EASY")}
            >
              <b>かんたん</b>
              <small>直感的に選択</small>
            </button>
            <button
              type="button"
              className={level === "NORMAL" ? "selected" : ""}
              onClick={() => setLevel("NORMAL")}
            >
              <b>ふつう</b>
              <small>公開情報から推理</small>
            </button>
          </div>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <button className="button button-primary wide-button" type="button" onClick={start}>
          対戦を始める <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
