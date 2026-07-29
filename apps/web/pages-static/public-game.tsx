import { useState } from "react";
import { CpuGame } from "../components/cpu-game";
import { OnlinePeerGame } from "./online-peer-game";

type GameMode = "MENU" | "CPU" | "ONLINE";

export function PublicGame() {
  const hasInvite = new URLSearchParams(window.location.search).has("room");
  const [mode, setMode] = useState<GameMode>(hasInvite ? "ONLINE" : "MENU");

  if (mode === "CPU") return <CpuGame />;
  if (mode === "ONLINE") return <OnlinePeerGame onExit={() => setMode("MENU")} />;

  return (
    <section className="page-shell setup-shell">
      <div className="setup-intro">
        <p className="eyebrow">CHOOSE YOUR TABLE</p>
        <h1>読み合う相手を、選ぶ。</h1>
        <p>すぐに遊べるCPU戦と、招待リンクでつながるオンライン対戦を選べます。</p>
      </div>
      <div className="setup-card">
        <button
          className="button button-primary wide-button"
          type="button"
          onClick={() => setMode("ONLINE")}
        >
          オンライン対戦 <span aria-hidden="true">→</span>
        </button>
        <p className="waiting-host">2〜4人・無料・登録不要</p>
        <button
          className="button button-secondary wide-button"
          type="button"
          onClick={() => setMode("CPU")}
        >
          CPU対戦
        </button>
        <p className="waiting-host">1〜3人のCPUと練習</p>
      </div>
    </section>
  );
}
