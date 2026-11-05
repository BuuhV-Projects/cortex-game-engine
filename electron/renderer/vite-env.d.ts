/**
 * Tipos de ambiente do Vite para o renderer do Studio.
 *
 * Traz as declarações dos sufixos de import que o Vite resolve em build-time —
 * entre eles `*?worker`, usado pelo `monacoWorkers.ts` (ADR-0690). Sem isso o
 * editor marca esses imports como TS2307 (`Cannot find module`), porque nenhum
 * `tsconfig` do repo cobre `electron/`.
 */
/// <reference types="vite/client" />
