import type { CSSProperties } from "react";
import Image from "next/image";
import { CARD_DEFINITIONS } from "@tenfold/game-engine";
import { CARD_ART } from "@/lib/card-art";
import { CardSigil } from "@/components/sigil";

export const metadata = { title: "カード一覧" };

export default function CardsPage() {
  return (
    <section className="page-shell">
      <div className="section-heading centered">
        <p className="eyebrow">THE TEN POWERS</p>
        <h1>王国を巡る、10の力。</h1>
        <p>全18枚。数字は山札切れと対決での強さを表します。</p>
      </div>
      <div className="card-catalog">
        {[...CARD_DEFINITIONS].reverse().map((card, index) => (
          <article
            className={`catalog-card card-${card.type.toLowerCase()}`}
            key={card.type}
            style={{ "--catalog-index": index } as CSSProperties}
          >
            <span className="catalog-rank">{card.rank}</span>
            <div className="catalog-art">
              <Image
                src={CARD_ART[card.type]}
                alt={`${card.displayName}を象徴するオリジナルイラスト`}
                fill
                loading={index < 5 ? "eager" : "lazy"}
                sizes="(max-width: 430px) 100vw, (max-width: 760px) 50vw, (max-width: 1080px) 33vw, 20vw"
              />
              <span className="catalog-sigil" aria-hidden="true">
                <CardSigil type={card.type} />
              </span>
            </div>
            <div className="catalog-copy">
              <small>{card.effectName}</small>
              <h2>{card.displayName}</h2>
              <p>{card.description}</p>
            </div>
            <span className="catalog-count">{card.count}枚</span>
          </article>
        ))}
      </div>
    </section>
  );
}
