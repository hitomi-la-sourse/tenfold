import { useState } from "react";
import { CpuGame } from "../components/cpu-game";

const ONLINE_GAME_URL = "https://tenfold-card-game.leafy-knoll-5739.chatgpt.site/play";

export function PublicGame() {
  const [showCpuGame, setShowCpuGame] = useState(false);

  if (showCpuGame) return <CpuGame />;

  return (
    <section className="page-shell setup-shell">
      <div className="setup-intro">
        <p className="eyebrow">CHOOSE YOUR TABLE</p>
        <h1>読み合う相手を、選ぶ。</h1>
        <p>すぐに遊べるCPU戦と、離れた相手と遊べるオンライン対戦を選べます。</p>
      </div>
      <div className="setup-card">
        <a className="button button-primary wide-button" href={ONLINE_GAME_URL}>
          オンライン対戦 <span aria-hidden="true">→</span>
        </a>
        <p className="waiting-host">2〜4人・別ネットワーク対応・登録不要</p>
        <button
          className="button button-secondary wide-button"
          type="button"
          onClick={() => setShowCpuGame(true)}
        >
          CPU対戦
        </button>
        <p className="waiting-host">1〜3人のCPUと練習</p>
      </div>
    </section>
  );
}
