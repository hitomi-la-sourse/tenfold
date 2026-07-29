"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { gameSocket } from "@/lib/socket";
import { getNickname, saveNickname, STORAGE_KEYS } from "@/lib/preferences";

interface AckSuccess {
  ok: true;
  code: string;
  playerId: string;
  reconnectToken: string;
}

function isAckSuccess(value: unknown): value is AckSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === true &&
    "code" in value &&
    typeof value.code === "string" &&
    "reconnectToken" in value &&
    typeof value.reconnectToken === "string"
  );
}

export function RoomEntry({ mode }: { mode: "create" | "join" | "quick" }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [showCpuFallback, setShowCpuFallback] = useState(false);

  useEffect(() => {
    setNickname(getNickname() || "旅人");
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setShowCpuFallback(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  useEffect(() => {
    if (mode !== "quick") return;
    const socket = gameSocket();
    const matched = (status: { state: "WAITING" | "MATCHED" | "CANCELLED"; code?: string }) => {
      if (status.state === "MATCHED" && status.code) {
        const waitingToken = sessionStorage.getItem("tenfold:quick-token");
        if (waitingToken) {
          localStorage.setItem(STORAGE_KEYS.reconnect(status.code), waitingToken);
          sessionStorage.removeItem("tenfold:quick-token");
        }
        router.push(`/room/${status.code}`);
      }
      if (status.state === "CANCELLED") setWaiting(false);
    };
    socket.on("matchmaking:status", matched);
    return () => {
      socket.off("matchmaking:status", matched);
    };
  }, [mode, router]);

  const submit = () => {
    const cleanName = nickname
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 16);
    if (!cleanName) {
      setError("ニックネームを入力してください");
      return;
    }
    saveNickname(cleanName);
    setError("");
    const socket = gameSocket();
    const onAck = (response: unknown) => {
      if (!isAckSuccess(response)) {
        const message =
          typeof response === "object" && response && "message" in response
            ? String(response.message)
            : "ルームへ接続できませんでした";
        setError(message);
        setWaiting(false);
        return;
      }
      localStorage.setItem(STORAGE_KEYS.reconnect(response.code), response.reconnectToken);
      router.push(`/room/${response.code}`);
    };
    if (mode === "create") socket.emit("room:create", { nickname: cleanName }, onAck);
    if (mode === "join") {
      socket.emit("room:join", { nickname: cleanName, code: code.toUpperCase() }, onAck);
    }
    if (mode === "quick") {
      setWaiting(true);
      socket.emit("matchmaking:join", { nickname: cleanName }, (response) => {
        if (isAckSuccess(response)) {
          onAck(response);
          return;
        }
        if (
          typeof response === "object" &&
          response &&
          "reconnectToken" in response &&
          typeof response.reconnectToken === "string"
        ) {
          sessionStorage.setItem("tenfold:quick-token", response.reconnectToken);
        }
      });
    }
  };

  const cancelQuick = () => {
    gameSocket().emit("matchmaking:cancel");
    setWaiting(false);
    setShowCpuFallback(false);
  };

  const headings = {
    create: ["PRIVATE TABLE", "合言葉で、仲間を招く。", "ルームを作る"],
    join: ["JOIN TABLE", "合言葉の先に、卓がある。", "ルームへ参加"],
    quick: ["QUICK MATCH", "いま待つ誰かと、一局。", "相手を探す"],
  } as const;

  return (
    <section className="page-shell setup-shell">
      <div className="setup-intro">
        <p className="eyebrow">{headings[mode][0]}</p>
        <h1>{headings[mode][1]}</h1>
        <p>
          {mode === "create"
            ? "発行された6文字のコードを共有してください。空席にはCPUも追加できます。"
            : mode === "join"
              ? "主催者から受け取った6文字のルームコードを入力します。"
              : "2人揃うと自動で対戦が始まります。待機中はいつでもキャンセルできます。"}
        </p>
      </div>
      <div className="setup-card">
        <label>
          <span>ニックネーム</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={16}
            autoComplete="nickname"
            disabled={waiting}
            placeholder="旅人"
          />
        </label>
        {mode === "join" && (
          <label>
            <span>ルームコード</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-HJ-NP-Z2-9]/g, "")
                    .slice(0, 6),
                )
              }
              maxLength={6}
              autoComplete="off"
              inputMode="text"
              placeholder="ABC234"
            />
          </label>
        )}
        {waiting ? (
          <div className="matchmaking-state" aria-live="polite">
            <div className="search-orbit" aria-hidden="true">
              <span />
            </div>
            <h2>対戦相手を探しています</h2>
            <p>このまま画面を開いてお待ちください。</p>
            <button
              className="button button-secondary wide-button"
              type="button"
              onClick={cancelQuick}
            >
              待機をキャンセル
            </button>
            {showCpuFallback && (
              <button
                className="text-button fallback-link"
                type="button"
                onClick={() => router.push("/play/cpu")}
              >
                CPU対戦へ切り替える
              </button>
            )}
          </div>
        ) : (
          <>
            {error && <p className="form-error">{error}</p>}
            <button
              className="button button-primary wide-button"
              type="button"
              onClick={submit}
              disabled={mode === "join" && code.length !== 6}
            >
              {headings[mode][2]} <span aria-hidden="true">→</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
