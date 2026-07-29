import type { CardType } from "@tenfold/shared";

export function CardSigil({ type }: { type: CardType }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="オリジナルの幾何学紋章">
      <circle cx="32" cy="32" r="27" {...common} opacity=".35" />
      {type === "HERO" && (
        <>
          <path d="M18 43 32 12l14 31-14 9Z" {...common} />
          <circle cx="32" cy="31" r="6" {...common} />
        </>
      )}
      {type === "EMPEROR" && (
        <>
          <path d="m15 38 4-20 13 10 13-10 4 20Z" {...common} />
          <path d="M19 44h26M24 50h16" {...common} />
        </>
      )}
      {type === "SPIRIT" && (
        <>
          <path d="M16 36c8-18 24-18 32 0-8 17-24 17-32 0Z" {...common} />
          <path d="M24 35c5-8 11-8 16 0-5 9-11 9-16 0Z" {...common} />
        </>
      )}
      {type === "SAGE" && (
        <>
          <path d="M17 18h20c7 0 10 5 10 11s-3 11-10 11H17Z" {...common} />
          <path d="M17 40h22c6 0 8 3 8 7H17ZM26 24v10m6-10v10" {...common} />
        </>
      )}
      {type === "NOBLE" && (
        <>
          <path d="m32 11 17 12-6 24H21l-6-24Z" {...common} />
          <path d="m23 30 9-7 9 7-3 10H26Z" {...common} />
        </>
      )}
      {type === "DEATH" && (
        <>
          <path d="M17 46c0-18 6-32 15-32s15 14 15 32Z" {...common} />
          <path d="m24 31 5 5m-5 0 5-5m6 0 5 5m-5 0 5-5M25 45h14" {...common} />
        </>
      )}
      {type === "MAIDEN" && (
        <>
          <path d="M32 12 49 20v13c0 10-7 17-17 21-10-4-17-11-17-21V20Z" {...common} />
          <path d="m23 33 6 6 13-14" {...common} />
        </>
      )}
      {type === "SEER" && (
        <>
          <path d="M12 32s8-13 20-13 20 13 20 13-8 13-20 13S12 32 12 32Z" {...common} />
          <circle cx="32" cy="32" r="7" {...common} />
          <path d="M32 25V13" {...common} />
        </>
      )}
      {type === "SOLDIER" && (
        <>
          <path d="m20 48 7-18-7-7 12-11 12 11-7 7 7 18Z" {...common} />
          <path d="M23 37h18M32 30v18" {...common} />
        </>
      )}
      {type === "BOY" && (
        <>
          <circle cx="32" cy="23" r="9" {...common} />
          <path d="M17 49c2-12 8-18 15-18s13 6 15 18M20 20 13 13m31 7 7-7" {...common} />
        </>
      )}
    </svg>
  );
}
