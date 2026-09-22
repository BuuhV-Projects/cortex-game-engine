# 0005 - CI valida o caminho nativo antes do merge na `main`

**Data:** 2026-09-22
**Status:** aceito

## Contexto

Hoje a pipeline só acorda **depois** do merge. `release.yml` dispara em
`push: branches: [main]` e faz `test` (Vitest no ubuntu) → `release`
(semantic-release) → `build` (matriz Windows/macOS/Linux com
`yarn electron:build`). `build-ide.yml` é o mesmo build, manual
(`workflow_dispatch`). `steam-sdk-watch.yml` é agendado e não valida código.

Duas consequências:

1. **Não existe gate de pull request.** Nenhum workflow tem trigger
   `pull_request`. O `yarn test` só roda quando o commit já está na `main` —
   quebra a `main` primeiro, avisa depois, e ainda derruba a release daquele
   push (o job `test` é `needs` do `release`).
2. **O host nativo C++ nunca é validado como código.** Ele é *compilado* no
   job `build` (Windows), pela action composta
   `.github/actions/build-native-host`, mas isso só acontece pós-merge e só
   quando o semantic-release decide publicar (`if: needs.release.outputs.released == 'true'`).
   Os testes unitários do host (`cortex_host_tests`, TDR-0004 — hoje **314
   checks**: enums, matemática BC7, `game_config`, `crash_handler`, espelho de
   cena, enumerador de casters, gate do passe de sombra, cache de pipeline,
   registro de geometria) **nunca rodaram na CI**: só existem no
   `yarn test:native`, que é um script PowerShell (`native/scripts/run-native-tests.ps1`)
   dependente do dev shell do Visual Studio na máquina do dev.

A branch que vai ser mesclada (`feat/m5-submissao-nativa`) adiciona passe de
sombra em C++ e espelho de cena em C++ — exatamente a lógica pura que aqueles
checks cobrem, e cujo modo de falha é **artefato visual**, não exceção. Subir
isso pra `main` sem gate é apostar que ninguém quebra o que não é compilado.

### O que foi levantado (medido nesta worktree)

- `native/third_party/` é gitignorado; as deps vêm de
  `native/scripts/fetch-deps.ps1`, todas **pinadas** (SDL3 `3.4.12`,
  wgpu-native `v29.0.1.1`, stb por commit, Roboto `v2.138`, basis_universal,
  NSIS, e o clone raso de `facebook/hermes` no commit
  `efcf68e2…` + `native/patches/hermes-upstream.patch`).
  Tamanho medido: **556 MB** em `native/third_party`, **84 MB** em
  `native/build` depois de um build Release completo com clang-cl.
- O alvo `cortex_host_tests` é **puro** (sem wgpu, sem NAPI, sem Hermes), mas
  tem `target_include_directories(... ${TP}/wgpu/include)` — precisa dos
  **headers** do wgpu.
- `cortex_host_tests` **não compila em Linux**: `src/core/crash_handler.cpp`
  inclui `<windows.h>` e `<dbghelp.h>` sem `#ifdef`, e entra na lista de
  fontes do alvo de teste.
- **Não dá pra configurar só os headers.** `native/CMakeLists.txt` dá
  `FATAL_ERROR` no *configure* se `third_party/hermes-upstream/src/CMakeLists.txt`
  não existir, e faz `add_subdirectory()` do Hermes. Ou seja: qualquer alvo
  deste projeto — inclusive o puro — exige o `fetch-deps.ps1` inteiro pra
  **configurar**. Buildar só o alvo de teste, porém, não compila o Hermes (ele
  é `EXCLUDE_FROM_ALL` e o alvo de teste não o linka).
- O contrato do `three` (`tests/native/three-contract.test.ts`, SPEC-0246)
  roda no Vitest (`include: ['tests/**/*.ts']`), sem GPU: **32 testes, verde
  em 345 ms** nesta worktree, e a trava de versão já imprime mensagem completa
  (versão validada × instalada + as dez premissas a revalidar).

## Decisão

Criar **`.github/workflows/pr.yml`** (`on: pull_request` para `main`, mais
`workflow_dispatch`), com dois jobs, e **não mexer** em `release.yml` /
`build-ide.yml` — o caminho que publica os instaladores do Studio fica
intacto.

### Job `test` (ubuntu-latest) — gate de PR do que já existia

Espelho exato do job `test` do `release.yml`: `yarn install --frozen-lockfile`,
`fetch-basis-encoder.mjs`, `yarn install` do `native/export-toolchain` e
`yarn test`. O ganho não é cobertura nova, é **momento**: o mesmo gate passa a
rodar antes do merge, não depois.

Isso responde a pergunta 4 (contrato do `three`): **já está coberto, e nada a
mais é preciso**. A suíte roda no ubuntu sem GPU, e a trava de versão falha com
mensagem legível no log — o que faltava era ela rodar antes do merge, que é
justamente o que este job entrega.

### Job `native-host` (windows-latest) — compila o host e roda os 314 checks

Um job só, reaproveitando a action composta que já existe
(`./.github/actions/build-native-host`), e depois dela:

```
cmake --build native/build --target cortex_host_tests
./native/build/cortex_host_tests.exe
```

O `cmake --build` já herda o ambiente MSVC (`ilammy/msvc-dev-cmd@v1` roda
dentro da action e exporta as variáveis pro resto do job) e o `native/build` já
está configurado pela action. Compilar o alvo puro por cima disso custa
**segundos**.

Por que um job só, e não um job "barato" só com os testes:

- o *configure* é o mesmo (e exige o clone do Hermes de qualquer jeito), então
  dois jobs pagariam `fetch-deps` e configure **duas vezes**;
- o build completo do host é o que responde literalmente ao pedido
  ("compatibilidade de build da engine/studio"): ele exercita o `bundle.mjs`
  real (esbuild sobre `src/` do engine + `three`), o `hermesc` e o link do
  `cortex_host.exe`. Uma mudança no engine que quebra o bundle nativo aparece
  aqui, não no export do usuário.

**É gate de merge, não informativo.** Um job informativo que ninguém olha tem o
mesmo valor de não existir; e o custo real (abaixo) é do build, que acontece
nos dois casos.

Respostas diretas:

- **Roda em Linux?** Não. `crash_handler.cpp` é Windows-only. Fazer rodar
  exigiria `#ifdef` em `native/src/` — mudança de código do host, fora do
  escopo desta mudança de infra, e de valor duvidoso: o host só tem alvo
  Windows/GDK hoje.
- **Precisa do `fetch-deps` inteiro ou só dos headers do wgpu?** Precisa do
  inteiro, por causa do `add_subdirectory(hermes)` no configure. Um caminho
  mais barato (baixar só `wgpu/include` e configurar um CMake mínimo só do alvo
  de teste) foi **rejeitado**: duplicaria a lista de fontes do alvo, e uma
  lista duplicada some de vista e diverge — o `cortex_host_tests` da CI
  deixaria de ser o mesmo que o dev roda.
- **Host Steam (`CORTEX_STEAM=ON`)?** Não entra no PR. É um segundo build
  completo, o `STEAMWORKS_SDK_KEY` não existe em PR de fork, e a action já
  trata a secret vazia pulando o passo. Continua validado no `release.yml`.

### Controles de custo

- `concurrency` com `cancel-in-progress: true` por PR: push novo cancela o run
  anterior.
- Cache novo do cargo (`~/.cargo/registry`, `~/.cargo/git`,
  `native/rapier-native/target`), chaveado por `Cargo.lock` — a action composta
  não cacheava o `cargo build --release` do `rapier-native`, que é o item
  pesado que sobrava sem cache. O cache é declarado **no workflow**, antes da
  action, justamente pra não alterar o comportamento da action compartilhada
  com o `release.yml`.
- Os caches de `native/third_party` e `native/build` são os que a action já
  declara, com chave por `hashFiles('native/CMakeLists.txt',
  'native/scripts/fetch-deps.ps1', 'native/patches/hermes-upstream.patch')` e
  `restore-keys` por prefixo.
- **Sem filtro de `paths`.** Filtro faria o job ser pulado em PR de doc, e job
  pulado vira check pendente eterno em branch protection — o remédio seria pior
  que a doença. O preço é PR de doc pagando o job nativo (com cache quente).
- Versões (Node, action) e timeouts vivem em `env` nomeado no topo do workflow
  (`NODE_VERSION`, `TIMEOUT_*_MINUTES`, `NATIVE_BUILD_DIR`,
  `NATIVE_TESTS_TARGET`) — sem número mágico espalhado nos steps.
  `timeout-minutes` de step aceita o contexto `env`; os valores passam por
  `fromJSON` porque expressão devolve string.

## Consequências

### Custo estimado (minutos de runner por PR)

| Job | Cache | Estimativa | Observação |
| --- | --- | --- | --- |
| `test` (ubuntu, 1×) | quente | 5–8 min | mesmo perfil do `test` do `release.yml` hoje |
| `native-host` (windows, **2×** na cobrança) | quente | 12–20 min | `fetch-deps` valida e sai, build Ninja incremental, `cortex_host_tests` em segundos |
| `native-host` (windows, 2×) | **frio** | 45–70 min | Hermes upstream são ~450 alvos |

Em minutos faturados, um PR típico com cache quente fica na casa de **30–45
min** (Windows conta 2×). O cache frio acontece quando `native/CMakeLists.txt`,
`fetch-deps.ps1` ou o patch do Hermes mudam — e mesmo aí o `restore-keys` por
prefixo entrega um `native/build` anterior, então na prática é um build
incremental, não do zero.

Escopo de cache do GitHub: PR **lê** os caches da branch default (`main`,
populados pelos runs do `release.yml`) e **escreve** no escopo do próprio PR.
Os volumes medidos (556 MB de `third_party` + 84 MB de `build`, comprimidos)
são confortáveis frente ao limite de 10 GB por repositório, mas com muitos PRs
abertos ao mesmo tempo a política LRU pode evitar entradas — o sintoma seria um
job nativo lento, não vermelho.

### Quando o `fetch-deps` muda de versão

Bumpar qualquer versão dentro de `native/scripts/fetch-deps.ps1` (SDL3, wgpu,
commit do Hermes…) muda o `hashFiles` das **três** chaves de cache da action
(`native-deps-*`, `native-build-*`, `native-build-steam-*`). O efeito:

1. `native/third_party` é baixado de novo do zero (o `_downloads` some junto) —
   é o passo de download inteiro, minutos;
2. `native/build` cai no `restore-keys` e entra num build incremental: o CMake
   reconfigura, e o que depender da dep trocada recompila. Trocar o commit do
   Hermes recompila os ~450 alvos (cache frio na prática);
3. o cache antigo fica órfão até a expiração (7 dias sem uso) — não precisa
   limpar à mão.

Ou seja: o PR que bumpa uma dep nativa **é** o PR caro, por construção. É o
comportamento desejado — é exatamente o PR que mais precisa provar que o host
ainda compila.

### O que muda pra quem mantém

- PR pra `main` passa a ter dois checks obrigatórios; marcá-los como
  *required* em branch protection é um passo **manual** no GitHub (não é
  configurável por arquivo no repo).
- Adicionar um `tests/*.cpp` novo ao alvo `cortex_host_tests` passa a ser
  coberto pela CI sem nenhum ajuste de workflow — o job builda o alvo, não uma
  lista de arquivos.
- `release.yml` e `build-ide.yml` continuam idênticos. Isso significa que um
  **push direto na `main`** (sem PR) segue sem passar pelos checks nativos —
  aceito conscientemente: o fluxo do repo é por PR, e duplicar o job nativo no
  `release.yml` dobraria o custo do caminho que publica os instaladores.
- `yarn test:native` continua existindo e continua sendo o caminho do dev; a CI
  não o usa (o script resolve o dev shell do VS via `vswhere`, coisa que o
  runner já resolve com `msvc-dev-cmd`).

### O que NÃO foi validado

**Não é possível executar o GitHub Actions a partir daqui.** A sintaxe YAML dos
workflows foi validada por parser, e as actions usadas já são as mesmas que o
repo usa hoje (`actions/checkout@v4`, `actions/setup-node@v4`,
`actions/cache@v4`, e a composta local `build-native-host`, que por sua vez usa
`dtolnay/rust-toolchain@stable`, `seanmiddleditch/gha-setup-ninja@v5`,
`ilammy/msvc-dev-cmd@v1`). Ficam para o **primeiro run real**:

1. se o ambiente MSVC exportado pela action dentro do job realmente alcança os
   steps seguintes (é o comportamento documentado do `msvc-dev-cmd`, mas nunca
   foi exercitado depois da action neste repo);
2. o tempo real dos jobs — os números da tabela são estimativa, não medição;
3. se o `restore-keys` do `native/build` de fato entrega cache de `main` para
   uma branch de PR (regra de escopo do GitHub diz que sim);
4. se algum dos 314 checks depende de algo da máquina do dev que o runner não
   tem (nenhum deveria: o alvo é puro e o `crash_handler` escreve em diretório
   temporário).
