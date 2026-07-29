import { describe, expect, it } from "vitest";
import { botThinkDelay, type BotRandom } from "./index";

const predictableRandom: BotRandom = {
  int(maxExclusive) {
    return maxExclusive - 1;
  },
};

describe("botThinkDelay", () => {
  it("カードを出した後の効果選択を十分に待つ", () => {
    expect(botThinkDelay(predictableRandom, "WAITING_FOR_PLAY")).toBe(3000);
    expect(botThinkDelay(predictableRandom, "WAITING_FOR_TARGET")).toBe(2800);
    expect(botThinkDelay(predictableRandom, "WAITING_FOR_GUESS")).toBe(2800);
  });

  it("テスト時は待ち時間を無効化できる", () => {
    expect(botThinkDelay(predictableRandom, "WAITING_FOR_TARGET", true)).toBe(0);
  });
});

