# 0219 - Progresso e cessão de frame no build da cena

**Data:** 2026-09-20
**Status:** aceito
**Decisão:** [ADR-0218](../adrs/ADR-0218-boot-cooperativo-cede-o-frame.md)

## Contexto

O `buildScene` é a etapa mais longa do boot (no kart-racer, ~3,5 s dos 9,8 s) e
até aqui rodava numa virada única de JS: não reportava progresso nem devolvia o
controle ao host. Resultado no export: splash atropelada, tela preta e barra de
carregamento parada — mesmo em jogo que usa o `runWithLoadingScreen`
(SPEC-0154), porque a tela só avança quando alguém chama `progress`.

## Decisão

### `src/core/frameYield.ts`

Cessão por **orçamento de tempo**, não por item — ceder por nó pagaria vsync por
nó e serializaria a carga (ADR-0218).

- `nextFrame()` cede uma vez. **No-op sem `requestAnimationFrame`** (Node/testes).
- `FrameBudget(budgetMs)` é o orçamento avulso, para o jogo usar nos seus laços:
  `maybeYield()` só cede quando a fatia acabou.
- O engine usa um orçamento **compartilhado** (`yieldOnBudget`,
  `frameBudgetExpired`, `resetFrameBudget`): o frame é um recurso global, e dois
  pontos de cessão seguidos com orçamentos separados gastariam dois frames onde
  um basta. A fatia é **adaptativa** — 30 ms com a splash no ar (é uma animação),
  250 ms depois dela (a tela de carregamento é estática).
- `yieldOnBudget()` só cede **dentro de um escopo de carregamento**
  (`beginLoadingScope`/`endLoadingScope`, `inLoadingScope`). Fora dele, ceder
  faria o `Game` renderizar a cena inteira a cada frame — ver ADR-0218.
- `isSplashActive()` responde se a splash do host ainda está na tela (sempre
  `false` no browser).

```ts
const budget = new FrameBudget();
for (const item of itens) {
  await carrega(item);
  await budget.maybeYield();
}
```

### Quem abre o escopo de carregamento

- `buildScene` abre e fecha sozinho enquanto monta, e marca a cena com
  `isSceneBuilding(scene)`;
- `game.setLoading(true/false)` é como o JOGO declara a carga que continua
  depois do build (criar personagens, veículos, sistemas).

Enquanto qualquer um dos dois vale, o `Game` desenha uma **cena vazia** no lugar
do cenário (a tela de carregamento do jogo aparece por cima) e, sob a splash,
não desenha nada — o host descarta esse frame de qualquer jeito.

### Splash sem fade-out (`native/src/webgpu/splash.cpp`)

`kFadeOutMs` vai a zero: a marca corta em vez de desvanecer, e o total da splash
cai de ~1,9 s para ~1,45 s. Motivo no ADR-0218 — congelar durante um fade é o
que denuncia o travamento; depois do corte quem desenha é a tela do jogo, que é
estática. A cena vazia do `Game` tem fundo preto explícito pra não deixar
resíduo do logo no quadro.

Mexer no host tem custo de propagação: o `launcher.exe` do export só muda quando
o Studio é reempacotado.

### `AssetLoader`

`loadGLTF`/`loadTexture` cedem por orçamento depois de carregar. É o que faz a
carga do JOGO (fora do `buildScene`) devolver o controle ao host sem o jogo
pedir — e, por ser condicionado ao escopo, não muda nada fora de um
carregamento.

### Progresso no `buildScene`

```ts
interface BuildSceneOptions {
  onProgress?: (progress: BuildProgress) => void | Promise<void>;
}

interface BuildProgress {
  /** Nós já instanciados. */
  done: number;
  /** Total de nós a instanciar. */
  total: number;
  /** Fração 0..1 da etapa de instanciação. */
  fraction: number;
  /** Etapa corrente: 'cena' | 'nós' | 'física' | 'merge'. */
  phase: BuildPhase;
}
```

O retorno é aguardado: quem devolve a promise do próximo frame (o `progress` do
`runWithLoadingScreen` faz isso) tem a barra andando **e** o frame cedido. Quem
devolve `void` só atualiza o próprio estado — a cessão do `FrameBudget`
acontece de qualquer forma.

`onProgress` é chamado no mesmo ritmo do orçamento (não por nó), mais uma vez
em cada troca de fase.

### O que o jogo faz

Nada é obrigatório: sem `onProgress`, o jogo exportado já ganha a splash
animando, porque a cessão não depende do callback. Para ter barra, o jogo passa
`onProgress` (direto, ou encadeado no `progress` do `runWithLoadingScreen`) e
pode usar `FrameBudget`/`nextFrame` nas suas próprias etapas longas — no
kart-racer, a criação dos seis carros (2,7 s) roda fora do `buildScene`.

## Consequências

- `buildScene` pode devolver o controle no meio da montagem: um frame
  intermediário pode pegar a cena parcial. No browser isso já acontecia; o host
  passa a se comportar igual.
- Resultado medido no kart-racer: primeira imagem 9,8 s → **1,1 s** (o logo) e
  jogo pronto 9,8 s → **~7,8 s**. A sequência na tela passa a ser logo animado →
  tela de carregamento → jogo.
- `onProgress` roda no meio da montagem: se lançar, derruba o build. Tratado
  como callback de UI — o engine não captura a exceção, para não esconder erro
  do jogo.
- Os pontos de cessão ficam redundantes (não errados) se um dia o `fetch` do
  host virar assíncrono (ADR-0218).
