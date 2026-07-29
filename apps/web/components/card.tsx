"use client";

import type { CSSProperties, PointerEvent } from "react";
import Image from "next/image";
import { CARD_BY_TYPE } from "@tenfold/game-engine";
import type { CardInstance } from "@tenfold/shared";
import { CARD_ART } from "@/lib/card-art";
import { CardSigil } from "./sigil";

interface GameCardProps {
  card: CardInstance;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  motionIndex?: number;
  onClick?: () => void;
}

export function GameCard({
  card,
  selected = false,
  disabled = false,
  compact = false,
  motionIndex,
  onClick,
}: GameCardProps) {
  const definition = CARD_BY_TYPE[card.type];
  const style = {
    "--card-index": motionIndex ?? 0,
  } as CSSProperties;

  const moveFoil = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    event.currentTarget.style.setProperty("--card-rx", `${(0.5 - y) * 8}deg`);
    event.currentTarget.style.setProperty("--card-ry", `${(x - 0.5) * 10}deg`);
    event.currentTarget.style.setProperty("--shine-x", `${x * 100}%`);
    event.currentTarget.style.setProperty("--shine-y", `${y * 100}%`);
  };

  const resetFoil = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.removeProperty("--card-rx");
    event.currentTarget.style.removeProperty("--card-ry");
    event.currentTarget.style.removeProperty("--shine-x");
    event.currentTarget.style.removeProperty("--shine-y");
  };

  const content = (
    <>
      <span className="card-art" aria-hidden="true">
        <Image
          src={CARD_ART[card.type]}
          alt=""
          fill
          loading="eager"
          sizes={compact ? "68px" : "(max-width: 760px) 39vw, 128px"}
        />
      </span>
      <span className="card-rank" aria-label={`ランク${card.rank}`}>
        {card.rank}
      </span>
      <span className="card-sigil" aria-hidden="true">
        <CardSigil type={card.type} />
      </span>
      <span className="card-copy">
        <strong>{definition.displayName}</strong>
        <small>{definition.effectName}</small>
        {!compact && <span>{definition.description}</span>}
      </span>
      <span className="card-foil" aria-hidden="true" />
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`game-card card-${card.type.toLowerCase()} ${selected ? "is-selected" : ""} ${
        compact ? "is-compact" : ""
      } ${motionIndex === undefined ? "" : "card-enter"}`}
      onClick={onClick}
      onPointerMove={moveFoil}
      onPointerLeave={resetFoil}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`ランク${card.rank} ${definition.displayName}、${definition.effectName}`}
      style={style}
    >
      {content}
    </button>
  ) : (
    <div
      className={`game-card card-${card.type.toLowerCase()} ${compact ? "is-compact" : ""} ${
        motionIndex === undefined ? "" : "card-enter"
      }`}
      style={style}
    >
      {content}
    </div>
  );
}

export function CardBack({ label = "秘匿札" }: { label?: string }) {
  return (
    <div className="card-back" aria-label={label}>
      <span className="card-back-shimmer" aria-hidden="true" />
      <span className="card-back-emblem" aria-hidden="true">
        <i />
        <i />
        <b>X</b>
      </span>
      <span className="card-back-wordmark" aria-hidden="true">
        TENFOLD
      </span>
      <small>{label}</small>
    </div>
  );
}
