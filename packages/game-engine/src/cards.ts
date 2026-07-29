import type { CardDefinition, CardInstance, CardType } from "@tenfold/shared";

export const CARD_DEFINITIONS: readonly CardDefinition[] = [
  {
    type: "HERO",
    rank: 10,
    count: 1,
    effectKey: "latent-rebirth",
    displayName: "英雄",
    effectName: "潜伏・転生",
    description: "自らは出せない。効果で失うと条件により転生する。",
  },
  {
    type: "EMPEROR",
    rank: 9,
    count: 1,
    effectKey: "public-execution",
    displayName: "皇帝",
    effectName: "公開処刑",
    description: "相手に1枚引かせ、公開した2枚から捨てる1枚を選ぶ。",
  },
  {
    type: "SPIRIT",
    rank: 8,
    count: 2,
    effectKey: "exchange",
    displayName: "精霊",
    effectName: "交換",
    description: "自分と相手の手札をひそかに交換する。",
  },
  {
    type: "SAGE",
    rank: 7,
    count: 2,
    effectKey: "foresight",
    displayName: "賢者",
    effectName: "選択",
    description: "次の手番、最大3枚から引く1枚を選ぶ。",
  },
  {
    type: "NOBLE",
    rank: 6,
    count: 2,
    effectKey: "duel",
    displayName: "貴族",
    effectName: "対決",
    description: "残した手札を比べ、低い側が脱落。同値なら相打ち。",
  },
  {
    type: "DEATH",
    rank: 5,
    count: 2,
    effectKey: "plague",
    displayName: "死神",
    effectName: "疫病",
    description: "相手の2枚を伏せ、AかBの一方を捨てさせる。",
  },
  {
    type: "MAIDEN",
    rank: 4,
    count: 2,
    effectKey: "sanctuary",
    displayName: "乙女",
    effectName: "守護",
    description: "次の自分の手番まで、他者のカード効果を防ぐ。",
  },
  {
    type: "SEER",
    rank: 3,
    count: 2,
    effectKey: "vision",
    displayName: "占師",
    effectName: "透視",
    description: "相手1人の手札を自分だけが見る。",
  },
  {
    type: "SOLDIER",
    rank: 2,
    count: 2,
    effectKey: "investigation",
    displayName: "兵士",
    effectName: "捜査",
    description: "相手の手札を宣言して当てれば脱落させる。",
  },
  {
    type: "BOY",
    rank: 1,
    count: 2,
    effectKey: "revolution",
    displayName: "少年",
    effectName: "革命",
    description: "2枚目に出た少年は公開処刑を起こす。",
  },
] as const;

export const CARD_BY_TYPE = Object.fromEntries(
  CARD_DEFINITIONS.map((card) => [card.type, card]),
) as Record<CardType, CardDefinition>;

export const CARD_BY_RANK = Object.fromEntries(
  CARD_DEFINITIONS.map((card) => [card.rank, card]),
) as Record<number, CardDefinition>;

export function createCardDeck(): CardInstance[] {
  return CARD_DEFINITIONS.flatMap((definition) =>
    Array.from({ length: definition.count }, (_, index) => ({
      id: `card-${definition.type.toLowerCase()}-${index + 1}`,
      type: definition.type,
      rank: definition.rank,
    })),
  );
}
