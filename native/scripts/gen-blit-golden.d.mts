// Tipos do gerador do golden do blit (ADR-0318), pro teste em TS.
export interface BlitGoldenCase {
  name: string;
  src: Uint8ClampedArray;
  dstBefore: Uint8ClampedArray;
  clip: Uint8Array | null;
  expected: Uint8ClampedArray;
  p: number[];
  smooth: boolean;
}
export const GOLDEN_PATH: string;
export function buildGoldenCases(): BlitGoldenCase[];
export function buildGoldenHeader(): string;
