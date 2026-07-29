import { useEffect, useMemo, useRef, useState } from "react";
import { Peer, type DataConnection } from "peerjs";
import {
  applyCommand,
  createGame,
  createPlayerView,
  CryptoRandomSource,
  type GameCommand,
  type GameState,
} from "@tenfold/game-engine";
import type { PlayerGameView } from "@tenfold/shared";
import { GameBoard } from "../components/game-board";
import { getNickname, saveNickname } from "../lib/preferences";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 4;
const random = new CryptoRandomSource();

interface Participant {
  id: string;
  nickname: string;
  isHost: boolean;
}

type GuestMessage =
  | { type: "JOIN"; nickname: string }
  | { type: "COMMAND"; command: GameCommand }
  | { type: "REMATCH" };

type HostMessage =
  | {
      type: "LOBBY";
      roomCode: string;
      players: Participant[];
      selfPlayerId: string;
    }
  | { type: "VIEW"; view: PlayerGameView }
  | { type: "ERROR"; message: string };

interface GuestConnection {
  connection: DataConnection;
  playerId: string;
  nickname: string;
}

interface OnlinePeerGameProps {
  onExit: () => void;
}

function cleanNickname(value: string): string {
  return value
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 16);
}

function normalizeRoomCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 6);
}

function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
}

function roomPeerId(roomCode: string): string {
  return `tenfold-${roomCode.toLowerCase()}`;
}

function isGuestMessage(value: unknown): value is GuestMessage {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return ["JOIN", "COMMAND", "REMATCH"].includes(String(value.type));
}

function isHostMessage(value: unknown): value is HostMessage {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return ["LOBBY", "VIEW", "ERROR"].includes(String(value.type));
}

export function OnlinePeerGame({ onExit }: OnlinePeerGameProps) {
  const initialCode = useMemo(
    () => normalizeRoomCode(new URLSearchParams(window.location.search).get("room") ?? ""),
    [],
  );
  const [nickname, setNickname] = useState(() => getNickname() || "旅人");
  const [joinCode, setJoinCode] = useState(initialCode);
  const [roomCode, setRoomCode] = useState(initialCode);
  const [role, setRole] = useState<"HOST" | "GUEST" | null>(null);
  const [status, setStatus] = useState<"SETUP" | "CONNECTING" | "LOBBY" | "PLAYING">("SETUP");
  const [players, setPlayers] = useState<Participant[]>([]);
  const [view, setView] = useState<PlayerGameView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const hostConnectionRef = useRef<DataConnection | null>(null);
  const guestConnectionsRef = useRef(new Map<string, GuestConnection>());
  const playersRef = useRef<Participant[]>([]);
  const hostPlayerIdRef = useRef("");
  const gameStateRef = useRef<GameState | null>(null);

  const setLobbyPlayers = (nextPlayers: Participant[]) => {
    playersRef.current = nextPlayers;
    setPlayers(nextPlayers);
  };

  const send = (connection: DataConnection, message: HostMessage | GuestMessage) => {
    if (connection.open) connection.send(message);
  };

  const broadcastLobby = (code: string) => {
    for (const guest of guestConnectionsRef.current.values()) {
      send(guest.connection, {
        type: "LOBBY",
        roomCode: code,
        players: playersRef.current,
        selfPlayerId: guest.playerId,
      });
    }
  };

  const publishGame = (state: GameState) => {
    gameStateRef.current = state;
    setView(createPlayerView(state, hostPlayerIdRef.current));
    setStatus("PLAYING");
    for (const guest of guestConnectionsRef.current.values()) {
      send(guest.connection, {
        type: "VIEW",
        view: createPlayerView(state, guest.playerId),
      });
    }
  };

  const startGame = () => {
    if (playersRef.current.length < 2) {
      setError("2人以上で対戦を開始できます。");
      return;
    }
    const nextGame = createGame(
      playersRef.current.map((player) => ({
        id: player.id,
        nickname: player.nickname,
      })),
      {
        random,
        firstPlayerIndex: random.int(playersRef.current.length),
      },
    );
    setError("");
    publishGame(nextGame);
  };

  const applyHostCommand = (command: GameCommand, playerId: string) => {
    const current = gameStateRef.current;
    if (!current) return;
    try {
      const trustedCommand = { ...command, playerId } as GameCommand;
      publishGame(applyCommand(current, trustedCommand, random).state);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "操作を実行できませんでした";
      if (playerId === hostPlayerIdRef.current) {
        setError(message);
      } else {
        const guest = [...guestConnectionsRef.current.values()].find(
          (candidate) => candidate.playerId === playerId,
        );
        if (guest) send(guest.connection, { type: "ERROR", message });
      }
    }
  };

  const cleanup = () => {
    hostConnectionRef.current?.close();
    hostConnectionRef.current = null;
    for (const guest of guestConnectionsRef.current.values()) {
      guest.connection.close();
    }
    guestConnectionsRef.current.clear();
    peerRef.current?.destroy();
    peerRef.current = null;
    gameStateRef.current = null;
  };

  useEffect(() => cleanup, []);

  const leave = () => {
    cleanup();
    window.history.replaceState(null, "", window.location.pathname);
    onExit();
  };

  const handleGuestConnection = (connection: DataConnection, code: string) => {
    connection.on("data", (payload) => {
      if (!isGuestMessage(payload)) return;

      if (payload.type === "JOIN") {
        if (gameStateRef.current) {
          send(connection, { type: "ERROR", message: "このルームは対戦中です。" });
          return;
        }
        if (guestConnectionsRef.current.has(connection.peer)) return;
        if (playersRef.current.length >= MAX_PLAYERS) {
          send(connection, { type: "ERROR", message: "このルームは満員です。" });
          return;
        }
        const guestNickname = cleanNickname(payload.nickname);
        if (!guestNickname) {
          send(connection, { type: "ERROR", message: "ニックネームを入力してください。" });
          return;
        }

        const playerId = `guest-${crypto.randomUUID()}`;
        guestConnectionsRef.current.set(connection.peer, {
          connection,
          playerId,
          nickname: guestNickname,
        });
        setLobbyPlayers([
          ...playersRef.current,
          { id: playerId, nickname: guestNickname, isHost: false },
        ]);
        broadcastLobby(code);
        return;
      }

      const guest = guestConnectionsRef.current.get(connection.peer);
      if (!guest) return;
      if (payload.type === "COMMAND") {
        applyHostCommand(payload.command, guest.playerId);
      } else if (payload.type === "REMATCH" && gameStateRef.current?.phase === "FINISHED") {
        startGame();
      }
    });

    connection.on("close", () => {
      const guest = guestConnectionsRef.current.get(connection.peer);
      if (!guest) return;
      guestConnectionsRef.current.delete(connection.peer);
      if (gameStateRef.current) {
        setError(`${guest.nickname}との接続が切れました。ルームを作り直してください。`);
        return;
      }
      setLobbyPlayers(playersRef.current.filter((player) => player.id !== guest.playerId));
      broadcastLobby(code);
    });

    connection.on("error", () => {
      setError("参加者との通信に失敗しました。");
    });
  };

  const createRoom = () => {
    const clean = cleanNickname(nickname);
    if (!clean) {
      setError("ニックネームを入力してください。");
      return;
    }
    cleanup();
    saveNickname(clean);
    const code = createRoomCode();
    const hostPlayerId = `host-${crypto.randomUUID()}`;
    const hostPeer = new Peer(roomPeerId(code), { debug: 1 });
    peerRef.current = hostPeer;
    hostPlayerIdRef.current = hostPlayerId;
    setLobbyPlayers([{ id: hostPlayerId, nickname: clean, isHost: true }]);
    setRoomCode(code);
    setRole("HOST");
    setStatus("CONNECTING");
    setError("");

    hostPeer.on("open", () => {
      window.history.replaceState(null, "", `${window.location.pathname}?room=${code}`);
      setStatus("LOBBY");
    });
    hostPeer.on("connection", (connection) => handleGuestConnection(connection, code));
    hostPeer.on("error", (peerError) => {
      setError(
        peerError.type === "unavailable-id"
          ? "ルームコードが重複しました。もう一度作成してください。"
          : "オンライン接続を開始できませんでした。",
      );
      setStatus("SETUP");
    });
  };

  const joinRoom = () => {
    const clean = cleanNickname(nickname);
    const code = normalizeRoomCode(joinCode);
    if (!clean) {
      setError("ニックネームを入力してください。");
      return;
    }
    if (code.length !== 6) {
      setError("6文字のルームコードを入力してください。");
      return;
    }
    cleanup();
    saveNickname(clean);
    const guestPeer = new Peer({ debug: 1 });
    peerRef.current = guestPeer;
    setRoomCode(code);
    setRole("GUEST");
    setStatus("CONNECTING");
    setError("");

    guestPeer.on("open", () => {
      const connection = guestPeer.connect(roomPeerId(code), {
        reliable: true,
        serialization: "json",
      });
      hostConnectionRef.current = connection;
      connection.on("open", () => {
        send(connection, { type: "JOIN", nickname: clean });
      });
      connection.on("data", (payload) => {
        if (!isHostMessage(payload)) return;
        if (payload.type === "LOBBY") {
          setLobbyPlayers(payload.players);
          setRoomCode(payload.roomCode);
          setStatus("LOBBY");
        } else if (payload.type === "VIEW") {
          setView(payload.view);
          setStatus("PLAYING");
        } else {
          setError(payload.message);
        }
      });
      connection.on("close", () => {
        setError("主催者との接続が切れました。");
      });
      connection.on("error", () => {
        setError("主催者との通信に失敗しました。");
      });
    });
    guestPeer.on("error", (peerError) => {
      setError(
        peerError.type === "peer-unavailable"
          ? "ルームが見つかりません。コードを確認してください。"
          : "オンライン接続に失敗しました。",
      );
      setStatus("SETUP");
    });
  };

  if (status === "PLAYING" && view) {
    return (
      <GameBoard
        view={view}
        onCommand={(command) => {
          setError("");
          if (role === "HOST") {
            applyHostCommand(command, hostPlayerIdRef.current);
          } else if (hostConnectionRef.current) {
            send(hostConnectionRef.current, { type: "COMMAND", command });
          }
        }}
        onRematch={() => {
          if (role === "HOST") startGame();
          else if (hostConnectionRef.current) {
            send(hostConnectionRef.current, { type: "REMATCH" });
          }
        }}
        onExit={leave}
        connectionLabel="P2Pオンライン"
        error={error}
      />
    );
  }

  if (status === "LOBBY" || status === "CONNECTING") {
    return (
      <section className="page-shell lobby-shell">
        <div className="lobby-heading">
          <div>
            <p className="eyebrow">ONLINE TABLE</p>
            <h1>王国の門前</h1>
            <p>2〜4人が揃ったら、主催者が対戦を始めます。</p>
          </div>
          <span className={`connection-badge ${status === "CONNECTING" ? "warning" : ""}`}>
            <i /> {status === "CONNECTING" ? "接続しています" : "接続済み"}
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
            <strong>{roomCode}</strong>
            <button
              className="button button-secondary"
              type="button"
              onClick={async () => {
                const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
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
              <small>{players.length}/4</small>
            </div>
            <div className="seat-list">
              {Array.from({ length: MAX_PLAYERS }, (_, index) => {
                const player = players[index];
                return player ? (
                  <div className="seat-row" key={player.id}>
                    <span className="seat-number">0{index + 1}</span>
                    <div className="player-avatar">{player.nickname.slice(0, 1)}</div>
                    <div>
                      <strong>{player.nickname}</strong>
                      <small>{player.isHost ? "主催者" : "参加者"} · 接続中</small>
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
            {role === "HOST" ? (
              <div className="lobby-controls">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={players.length < 2}
                  onClick={startGame}
                >
                  対戦を始める
                </button>
              </div>
            ) : (
              <p className="waiting-host">主催者が対戦を始めるのを待っています。</p>
            )}
            <button className="text-button leave-link" type="button" onClick={leave}>
              ルームを退出
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell setup-shell">
      <div className="setup-intro">
        <p className="eyebrow">ONLINE TABLE</p>
        <h1>離れた相手と、同じ卓へ。</h1>
        <p>ルームを作成して招待リンクを共有するか、受け取ったコードで参加してください。</p>
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
        <button className="button button-primary wide-button" type="button" onClick={createRoom}>
          新しいルームを作る <span aria-hidden="true">→</span>
        </button>
        <label>
          <span>ルームコード</span>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
            maxLength={6}
            autoComplete="off"
            placeholder="ABC234"
          />
        </label>
        <button className="button button-secondary wide-button" type="button" onClick={joinRoom}>
          ルームに参加
        </button>
        {error && <p className="form-error">{error}</p>}
        <p className="waiting-host">
          通信環境によっては接続できない場合があります。ルーム内の通信はブラウザ間で暗号化されます。
        </p>
        <button className="text-button leave-link" type="button" onClick={onExit}>
          モード選択へ戻る
        </button>
      </div>
    </section>
  );
}
