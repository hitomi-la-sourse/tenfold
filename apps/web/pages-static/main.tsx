import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CpuGame } from "../components/cpu-game";
import "../app/globals.css";

function StaticGame() {
  return (
    <>
      <a className="skip-link" href="#main">
        本文へ移動
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="TENFOLD トップへ">
          <span className="brand-mark" aria-hidden="true">
            X
          </span>
          <span>
            <strong>TENFOLD</strong>
            <small>王国の心理戦</small>
          </span>
        </a>
        <nav aria-label="メインナビゲーション">
          <a href="#main">CPU対戦</a>
        </nav>
      </header>
      <main id="main">
        <CpuGame />
      </main>
      <footer className="site-footer">
        <span>TENFOLD — an original card game</span>
        <span>無料・登録不要</span>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StaticGame />
  </StrictMode>,
);
