"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameCommand } from "@tenfold/game-engine";
import type { RoomView } from "@tenfold/shared";
import { GameBoard } from "./game-board";
import {
  commandOnlineRoom,
  fetchOnlineRoom,
  leaveOnlineRoom,
  rematchOnlineRoom,
  startOnlineRoom,
} from "@/lib/online-api";
import { STORAGE_KEYS } from "@/lib/preferences";

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<"CONNECTED" | "RECONNECTING" | "DISCONNECTED">(
    "RECONNECTING",
  );
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef("");
  const roomRef = useRef<RoomView | null>(null);

  const acceptRoom = (next: RoomView) => {
    roomRef.current = next;
    setRoom(next);
    setConnection("CONNECTED");
    setError("");
  };

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.reconnect(code)) ?? "";
    tokenRef.current = token;
    if (!token) {
      setConnection("DISCONNECTED");
      setError("参加情報がありません。招待リンクからルームへ入り直してください。");
      return;
    }

    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await fetchOnlineRoom(code, token);
        if (!active) return;
        acceptRoom(next);
      } catch (cause) {
        if (!active) return;
        setConnection("RECONNECTING");
        setError(cause instanceof Error ? cause.message : "ルームへ再接続しています");
      }
      if (active) {
        timer = window.setTimeout(poll, roomRef.current?.status === "LOBBY" ? 900 : 1200);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [code]);

  const runRoomAction = async (action: () => Promise<RoomView>) => {
    try {
      setError("");
      acceptRoom(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作を完了できませんでした");
    }
  };

  const self = room?.players.find((player) => player.id === room.selfPlayerId);

  const leave = async () => {
    const token = tokenRef.current;
    localStorage.removeItem(STORAGE_KEYS.reconnect(code));
    if (token) {
      try {
        await leaveOnlineRoom(code, token);
      } catch {
        // 退出後の画面遷移を優先します。
      }
    }
    router.push("/play");
  };

  if (room?.game) {
    return (
      <GameBoard
        view={room.game}
        onCommand={(command: GameCommand) =>
          void runRoomAction(() => commandOnlineRoom(code, tokenRef.current, command))
        }
        onRematch={() => void runRoomAction(() => rematchOnlineRoom(code, tokenRef.current))}
        onExit={() => void leave()}
        connectionLabel={
          connection === "CONNECTED"
            ? "サーバー同期"
            : connection === "RECONNECTING"
              ? "再接続しています"
              : "通信が切断されました"
        }
        error={error}
      />
    );
  }

  return (
    <section className="page-shell lobby-shell">
      <div className="lobby-heading">
        <div>
          <p className="eyebrow">PRIVATE TABLE</p>
          <h1>王国の門前</h1>
          <p>2〜4人が揃ったら、主催者が対戦を始めます。</p>
        </div>
        <span className={`connection-badge ${connection !== "CONNECTED" ? "warning" : ""}`}>
          <i /> {connection === "CONNECTED" ? "接続済み" : "接続しています"}
        </span>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="lobby-grid">
        <div className="room-code-panel">
          <small>ROOM CODE</small>
          <strong>{code}</strong>
          <button
            className="button button-secondary"
            type="button"
            onClick={async () => {
              const inviteUrl = `${window.location.origin}/room/join?code=${code}`;
              await navigator.clipboard.writeText(inviteUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? "コピーしました" : "招待リンクをコピー"}
          </button>
          <p>リンクまたは6文字のコードを一緒に遊ぶ人へ共有してください。</p>
        </div>

        <div className="seats-panel">
          <div className="panel-title">
            <span>参加者</span>
            <small>{room?.players.length ?? 0}/4</small>
          </div>
          <div className="seat-list">
            {Array.from({ length: 4 }, (_, index) => {
              const player = room?.players[index];
              return player ? (
                <div className="seat-row" key={player.id}>
                  <span className="seat-number">0{index + 1}</span>
                  <div className="player-avatar">{player.nickname.slice(0, 1)}</div>
                  <div>
                    <strong>{player.nickname}</strong>
                    <small>
                      {player.isHost ? "主催者" : "参加者"} ·{" "}
                      {player.connectionStatus === "CONNECTED" ? "参加中" : "退出済み"}
                    </small>
                  </div>
                </div>
              ) : (
                <div className="seat-row empty" key={`empty-${index}`}>
                  <span className="seat-number">0{index + 1}</span>
                  <div className="empty-avatar">+</div>
                  <div>
                    <strong>空席</strong>
                    <small>参加を待っています</small>
                  </div>
                </div>
              );
            })}
          </div>

          {self?.isHost ? (
            <div className="lobby-controls">
              <button
                className="button button-primary"
                type="button"
                disabled={(room?.players.length ?? 0) < 2}
                onClick={() => void runRoomAction(() => startOnlineRoom(code, tokenRef.current))}
              >
                対戦を始める
              </button>
            </div>
          ) : (
            <p className="waiting-host">主催者が対戦を始めるのを待っています。</p>
          )}
          <button className="text-button leave-link" type="button" onClick={() => void leave()}>
            ルームを退出
          </button>
        </div>
      </div>
    </section>
  );
}
