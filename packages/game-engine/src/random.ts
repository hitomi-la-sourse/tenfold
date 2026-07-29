import type { RandomSource } from "./types";

export class CryptoRandomSource implements RandomSource {
  int(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer");
    }
    const ceiling = 0x1_0000_0000;
    const limit = ceiling - (ceiling % maxExclusive);
    const buffer = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(buffer);
    } while ((buffer[0] ?? 0) >= limit);
    return (buffer[0] ?? 0) % maxExclusive;
  }
}

export class SeededRandomSource implements RandomSource {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0;
  }

  int(maxExclusive: number): number {
    this.value = (1664525 * this.value + 1013904223) >>> 0;
    return Math.floor((this.value / 0x1_0000_0000) * maxExclusive);
  }
}

export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = random.int(index + 1);
    const currentValue = result[index];
    const otherValue = result[other];
    if (currentValue === undefined || otherValue === undefined) continue;
    result[index] = otherValue;
    result[other] = currentValue;
  }
  return result;
}
