// Reinício pedido pelo JOGO (SPEC-0717): __cortexRestart() marca o pedido aqui e
// empurra SDL_EVENT_QUIT (mesmo teardown do quit, SPEC-0120); no fim do main,
// com janela, GPU, SDL, GDK e Steam já desligados, relaunchIfRequested() abre o
// próprio exe de novo com a mesma linha de comando. Só no PC Windows sem GDK:
// no console um app não abre outra cópia de si (lá a bridge nem é registrada).
#pragma once

namespace core {

/** O host sabe se relançar nesta plataforma (Windows sem GDK). */
bool relaunchSupported();

/** Marca que o encerramento em curso deve terminar relançando o exe. */
void requestRelaunch();

/** Há pedido de relançamento pendente. */
bool relaunchRequested();

/** Esquece o pedido (testes). */
void clearRelaunchRequest();

/** Abre o próprio exe com a mesma linha de comando e pasta corrente. `false` se falhar ou não for suportado. */
bool spawnSelf();

using SpawnFn = bool (*)();

/**
 * Fim do main: com pedido pendente, chama `spawn` (padrão: spawnSelf) uma vez e
 * devolve se relançou. Falha vai pro error_log.txt e o host só sai (como um quit).
 */
bool relaunchIfRequested(SpawnFn spawn = spawnSelf);

}  // namespace core
