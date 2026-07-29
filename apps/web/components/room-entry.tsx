"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOnlineRoom, joinOnlineRoom } from "@/lib/online-api";
import { getNickname, saveNickname, STORAGE_KEYS } from "@/lib/preferences";

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, 6);
}

export function RoomEntry({ mode }: { mode: "create" | "join" }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNickname(getNickname() || "旅人");
    if (mode === "join") {
      setCode(normalizeCode(new URLSearchParams(window.location.search).get("code") ?? ""));
    }
  }, [mode]);

  const submit = async () => {
    const cleanName = nickname
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 16);
    if (!cleanName) {
      setError("ニックネームを入力してください");
      return;
    }

    setSubmitting(true);
    setError("");
    saveNickname(cleanName);
    try {
      const response =
        mode === "create"
          ? await createOnlineRoom(cleanName)
          : await joinOnlineRoom(code, cleanName);
      localStorage.setItem(STORAGE_KEYS.reconnect(response.code), response.reconnectToken);
      router.push(`/room/${response.code}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ルームへ接続できませんでした");
      setSubmitting(false);
    }
  };

  const headings = {
    create: ["PRIVATE TABLE", "合言葉で、仲間を招く。", "ルームを作る"],
    join: ["JOIN TABLE", "合言葉の先に、卓がある。", "ルームへ参加"],
  } as const;

  return (
    <section className="page-shell setup-shell">
      <div className="setup-intro">
        <p className="eyebrow">{headings[mode][0]}</p>
        <h1>{headings[mode][1]}</h1>
        <p>
          {mode === "create"
            ? "招待リンクまたは6文字のコードを共有して、2〜4人で遊べます。"
            : "主催者から受け取った招待リンク、または6文字のコードで参加します。"}
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
            disabled={submitting}
            placeholder="旅人"
          />
        </label>
        {mode === "join" && (
          <label>
            <span>ルームコード</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              maxLength={6}
              autoComplete="off"
              inputMode="text"
              disabled={submitting}
              placeholder="ABC234"
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <button
          className="button button-primary wide-button"
          type="button"
          onClick={() => void submit()}
          disabled={submitting || (mode === "join" && code.length !== 6)}
        >
          {submitting ? "接続しています…" : headings[mode][2]}{" "}
          {!submitting && <span aria-hidden="true">→</span>}
        </button>
        <p className="waiting-host">
          サーバー経由で同期するため、離れた場所や異なる回線から参加できます。
        </p>
      </div>
    </section>
  );
}
