"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameCommand } from "@tenfold/game-engine";
import type { RoomView } from "@tenfold/shared";
import { GameBoard } from "./game-board";
import { gameSocket } from "@/lib/socket";
import { STORAGE_KEYS } from "@/lib/preferences";

function emitGameCommand(command: GameCommand): void {
  const socket = gameSocket();
  const payload = { commandId: command.commandId };
  switch (command.type) {
    case "PLAY_CARD":
      socket.emit("game:play-card", { ...payload, cardId: command.cardId });
      break;
    case "SELECT_TARGET":
      socket.emit("game:select-target", { ...payload, targetPlayerId: command.targetPlayerId });
      break;
    case "SELECT_GUESS":
      socket.emit("game:select-guess", { ...payload, guessRank: command.guessRank });
      break;
    case "SELECT_PUBLIC_EXECUTION_CARD":
      socket.emit("game:select-public-execution-card", { ...payload, cardId: command.cardId });
      break;
    case "SELECT_DEATH_CARD":
      socket.emit("game:select-death-card", { ...payload, position: command.position });
      break;
    case "SELECT_SAGE_CARD":
      socket.emit("game:select-sage-card", { ...payload, cardId: command.cardId });
      break;
  }
}

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<"CONNECTED" | "RECONNECTING" | "DISCONNECTED">(
    "RECONNECTING",
  );
  const [copied, setCopied] = useState(false);
  const socket = useMemo(() => gameSocket(), []);

  useEffect(() => {
    const onRoom = (next: RoomView) => {
      if (next.code !== code) return;
      setRoom(next);
      setConnection("CONNECTED");
      setError("");
    };
    const onError = (data: { message: string }) => setError(data.message);
    const onConnect = () => {
      setConnection("CONNECTED");
      const token = localStorage.getItem(STORAGE_KEYS.reconnect(code));
      if (token) {
        socket.emit("player:reconnect", { code, token }, (response) => {
          if (
            typeof response === "object" &&
            response &&
            "ok" in response &&
            response.ok === false &&
            "message" in response
          ) {
            setError(String(response.message));
          }
        });
      }
    };
    const onDisconnect = () => setConnection("RECONNECTING");
    socket.on("room:state", onRoom);
    socket.on("room:error", onError);
    socket.on("game:error", onError);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off("room:state", onRoom);
      socket.off("room:error", onError);
      socket.off("game:error", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [code, socket]);

  const self = room?.players.find((player) => player.id === room.selfPlayerId);

  const leave = () => {
    socket.emit("room:leave", { code });
    localStorage.removeItem(STORAGE_KEYS.reconnect(code));
    router.push("/play");
  };

  if (room?.game) {
    return (
      <GameBoard
        view={room.game}
        onCommand={emitGameCommand}
        onRematch={() => socket.emit("game:request-rematch", { code })}
        onExit={leave}
        connectionLabel={
          connection === "CONNECTED"
            ? "オンライン"
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
          <i /> {connection === "CONNECTED" ? "接続済み" : "再接続しています"}
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
              await navigator.clipboard.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? "コピーしました" : "コードをコピー"}
          </button>
          <p>この6文字を一緒に遊ぶ人へ共有してください。</p>
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
                  <div className="player-avatar">
                    {player.isBot ? "CPU" : player.nickname.slice(0, 1)}
                  </div>
                  <div>
                    <strong>{player.nickname}</strong>
                    <small>
                      {player.isHost ? "主催者" : player.isBot ? "CPUプレイヤー" : "参加者"} ·{" "}
                      {player.connectionStatus === "CONNECTED" ? "接続中" : "切断中"}
                    </small>
                  </div>
                  {self?.isHost && player.isBot && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => socket.emit("room:remove-bot", { code, playerId: player.id })}
                    >
                      削除
                    </button>
                  )}
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

          {self?.isHost && (
            <div className="lobby-controls">
              <button
                className="button button-secondary"
                type="button"
                disabled={(room?.players.length ?? 0) >= 4}
                onClick={() => socket.emit("room:add-bot", { code, level: "NORMAL" })}
              >
                CPUを追加
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={(room?.players.length ?? 0) < 2}
                onClick={() => socket.emit("room:start", { code })}
              >
                対戦を始める
              </button>
            </div>
          )}
          {!self?.isHost && <p className="waiting-host">主催者が対戦を始めるのを待っています。</p>}
          <button className="text-button leave-link" type="button" onClick={leave}>
            ルームを退出
          </button>
        </div>
      </div>
    </section>
  );
}
