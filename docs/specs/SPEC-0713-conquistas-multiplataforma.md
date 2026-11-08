# SPEC-0713 - Conquistas multiplataforma (`Achievements`)

**Data:** 2026-11-07
**Status:** implementado
**Decisão:** ADR-0714
**Continua:** SPEC-0175 (fachada `Steam`), ADR-0164 (`gamePlatform`)

## Contexto

A fachada `Steam` (SPEC-0175) expõe as chamadas cruas do Steamworks: `unlockAchievement` marca, `storeStats` envia e
mostra o aviso. Cada jogo que quer conquistas acabava reescrevendo a mesma coisa em cima dela: escolher a plataforma
pelo `gamePlatform()`, não chamar a Steam no navegador e não repetir o desbloqueio de uma conquista que o jogador já
tem. O primeiro caso foi o Port Hollow (conquista do fim da intro), que precisa também do Xbox no futuro.

## Decisão

Módulo novo `src/core/achievements.ts`, exportado pelo `index-runtime`.

### Interface

```ts
type AchievementBackend = 'steam' | 'null';

interface Achievements {
  readonly backend: AchievementBackend;
  unlock(id: string): boolean;   // true quando a conquista ficou (ou já estava) desbloqueada
  has(id: string): boolean;
}
```

- O `id` é o *API Name* cadastrado na plataforma (no Steamworks, em Stats & Achievements).
- **A idempotência é da engine:** o jogo chama `unlock(id)` toda vez que o jogador ganha a conquista; a engine só fala
  com a plataforma se ela ainda não foi desbloqueada. Repetir o `unlock` não chama o Steamworks de novo.
- Nada lança. Sem plataforma, com o cliente fechado ou com id desconhecido, o motivo vai para `debug('achievements', …)`.

### Implementações

| Classe | Quando | `unlock(id)` |
|---|---|---|
| `SteamAchievements` | plataforma `steam` e `Steam.isAvailable()` | se o id está no cache da sessão: `true` sem chamada. Senão `hasAchievement(id)` (já tinha: guarda no cache). Senão `unlockAchievement(id)` + `storeStats()` uma vez, e guarda no cache. Recusada pela Steam (id fora do app): `false`, nada é enviado e o id não entra no cache. |
| `NullAchievements` | `pc`, navegador, Studio, `steam` sem cliente, `xbox` (ainda sem implementação) | guarda em memória na sessão e registra no `debug`; não persiste |

`SteamAchievements` recebe uma `AchievementSteamPort` (o recorte da fachada que usa: `isAvailable`, `unlockAchievement`,
`hasAchievement`, `storeStats`); o padrão é a própria `Steam`, e os testes passam uma falsa.

### Factory

- `createAchievements(platform, steam = Steam)`: `steam` + `isAvailable()` → `SteamAchievements`; `steam` sem cliente →
  `NullAchievements` com aviso; `xbox` → `NullAchievements` com aviso de "sem implementação" (o ramo existe para o Xbox
  entrar só aqui); `pc` → `NullAchievements`.
- `loadAchievements(file?)`: lê a plataforma com `gamePlatform(file)` e cria uma vez por sessão (memorizado, como o
  `gamePlatform`). `resetAchievementsCache()` esquece (testes e hot-reload do Studio).

### Exemplo

```ts
const achievements = await loadAchievements();
// no momento em que o jogador ganha:
achievements.unlock('intro_completed');
```

## Consequências

- Os jogos não precisam mais chamar `Steam.unlockAchievement` + `storeStats` à mão nem guardar o que já foi enviado.
- O texto que a Steam mostra (nome, descrição, ícones) continua no painel do Steamworks; a engine só manda o id.
- Desbloqueio sem plataforma não persiste: não há sincronização posterior com a Steam (fora do escopo).

## Testes

`tests/core/achievements.test.ts`, com uma Steam falsa: escolha da factory por plataforma; um `unlock` chama
`unlockAchievement` + `storeStats` uma vez e o segundo não chama nada; conquista que o jogador já tinha não é
reenviada; id recusado não envia e pode ser tentado de novo; a nula; e a memorização de `loadAchievements`.
