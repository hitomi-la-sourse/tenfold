import Link from "next/link";

const features = [
  { number: "01", title: "読む", copy: "捨て札と沈黙から、相手の一枚を見抜く。" },
  { number: "02", title: "惑わす", copy: "高位札を守るか、あえて勝負へ踏み込むか。" },
  { number: "03", title: "生き残る", copy: "最後の一人、あるいは山札の尽きる瞬間まで。" },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-glass" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">A GAME OF TEN POWERS</p>
          <h1>
            王国は、
            <br />
            <em>一枚の嘘</em>で揺らぐ。
          </h1>
          <p className="hero-lead">
            10の力を操り、相手の手札を読み切る。
            <br />
            2〜4人で遊ぶ、短く深い推理・心理戦。
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/play/cpu">
              CPUと遊ぶ
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="button button-secondary" href="/play">
              オンラインで遊ぶ
            </Link>
          </div>
          <p className="trust-line">
            <span>無料</span>
            <span>登録不要</span>
            <span>約10分</span>
          </p>
        </div>
        <div className="hero-card-stack" aria-hidden="true">
          <div className="showcase-card card-one">
            <b>10</b>
            <span>潜伏</span>
          </div>
          <div className="showcase-card card-two">
            <b>7</b>
            <span>選択</span>
          </div>
          <div className="showcase-card card-three">
            <b>2</b>
            <span>捜査</span>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="eyebrow">THE MIND GAME</p>
          <h2>運だけでは、王座には届かない。</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.number}>
              <span>{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div>
          <p className="eyebrow">YOUR FIRST MOVE</p>
          <h2>まずはCPU相手に、王国へ。</h2>
        </div>
        <Link className="button button-primary" href="/play/cpu">
          対戦を始める <span aria-hidden="true">→</span>
        </Link>
      </section>
    </>
  );
}
