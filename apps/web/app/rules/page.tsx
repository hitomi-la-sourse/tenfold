import Link from "next/link";

export const metadata = { title: "遊び方" };

const turns = [
  ["1", "引く", "手番の始めに山札から1枚引き、手札を2枚にします。"],
  ["2", "選ぶ", "英雄以外の1枚を選び、確認して場へ出します。"],
  ["3", "解く", "対象や宣言を選び、カードの効果を解決します。"],
  ["4", "巡る", "脱落と勝敗を確かめ、次の生存者へ手番が移ります。"],
];

export default function RulesPage() {
  return (
    <section className="page-shell prose-page">
      <div className="section-heading">
        <p className="eyebrow">HOW TO PLAY</p>
        <h1>最後の一枚まで、意図を隠す。</h1>
        <p>各プレイヤーは手札を1枚だけ残しながら、10種類の力で生き残りを競います。</p>
      </div>
      <div className="rule-steps">
        {turns.map(([number, title, copy]) => (
          <article key={number}>
            <span>{number}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="rule-columns">
        <article className="glass-panel">
          <p className="eyebrow">VICTORY</p>
          <h2>勝利条件</h2>
          <ul>
            <li>自分だけが生き残れば即座に勝利。</li>
            <li>山札が尽きたら、最も高いランクの手札が勝利。</li>
            <li>最高ランクが同じ、または全員脱落なら引き分け。</li>
          </ul>
        </article>
        <article className="glass-panel">
          <p className="eyebrow">THE SEALED CARD</p>
          <h2>転生札</h2>
          <p>
            配札後に1枚を封印します。英雄を特定の効果で失った者は、その札を新しい手札として一度だけ復帰できます。
            皇帝の公開処刑では転生できません。
          </p>
        </article>
      </div>
      <div className="inline-cta">
        <Link className="button button-secondary" href="/cards">
          全10種のカードを見る
        </Link>
        <Link className="button button-primary" href="/play/cpu">
          実戦で覚える
        </Link>
      </div>
    </section>
  );
}
