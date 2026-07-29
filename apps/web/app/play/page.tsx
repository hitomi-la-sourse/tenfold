import Link from "next/link";

export const metadata = { title: "対戦を選ぶ" };

export default function PlayPage() {
  return (
    <section className="page-shell">
      <div className="section-heading centered">
        <p className="eyebrow">CHOOSE YOUR TABLE</p>
        <h1>どの卓へ向かいますか？</h1>
        <p>アカウント登録は不要です。ニックネームだけで始められます。</p>
      </div>
      <div className="mode-grid">
        <Link className="mode-card" href="/play/cpu">
          <span className="mode-number">01</span>
          <div>
            <small>SOLO PRACTICE</small>
            <h2>CPU対戦</h2>
            <p>人数と強さを選び、すぐに心理戦を始めます。</p>
          </div>
          <b aria-hidden="true">→</b>
        </Link>
        <Link className="mode-card" href="/room/new">
          <span className="mode-number">02</span>
          <div>
            <small>PRIVATE TABLE</small>
            <h2>合言葉ルーム</h2>
            <p>6文字のコードを共有して、2〜4人で集まります。</p>
          </div>
          <b aria-hidden="true">→</b>
        </Link>
        <Link className="mode-card" href="/room/join?quick=1">
          <span className="mode-number">03</span>
          <div>
            <small>QUICK MATCH</small>
            <h2>クイック対戦</h2>
            <p>相手が見つかり次第、自動で2人対戦を始めます。</p>
          </div>
          <b aria-hidden="true">→</b>
        </Link>
      </div>
    </section>
  );
}
