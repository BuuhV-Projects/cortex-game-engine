// Limpeza da pasta de saída do export (ADR-0101). No Windows NÃO se apaga a
// própria pasta de destino: remover + recriar cai no estado "delete pending" (o
// SO segura o NOME do diretório enquanto um handle não solta — Explorer aberto,
// terminal com cwd lá, antivírus escaneando) e o mkdir seguinte estoura EPERM.
// A estratégia é ESVAZIAR o conteúdo, entrada por entrada, e manter o
// diretório-raiz vivo.
import fs from 'node:fs';
import path from 'node:path';

/**
 * Deixa `dir` existente e VAZIO, pronto pra regravar o export.
 *
 * - Se `dir` não existe, cria (recursivo) e retorna.
 * - Se existe, remove cada entrada (arquivos e subpastas, recursivo) SEM apagar
 *   o próprio `dir` — evita o delete-pending do Windows.
 *
 * `maxRetries`/`retryDelay` do `rmSync` absorvem locks TRANSITÓRIOS do SO
 * (handles ainda soltando). Um arquivo TRAVADO de verdade — o exe do jogo aberto
 * segurando `game.exe` — propaga o erro (EPERM/EBUSY/EACCES/ENOTEMPTY) pro
 * chamador, que traduz numa mensagem acionável (guardLocks em export-game.mjs).
 *
 * @param {string} dir  Pasta de destino (ex.: `<gameDir>/dist-native`).
 * @param {typeof import('node:fs')} [io]  Injetável pra teste; default = `fs`.
 */
export function prepareDist(dir, io = fs) {
  if (!io.existsSync(dir)) {
    io.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of io.readdirSync(dir)) {
    io.rmSync(path.join(dir, entry), {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 150,
    });
  }
}
