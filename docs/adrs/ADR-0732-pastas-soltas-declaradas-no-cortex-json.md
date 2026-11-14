# ADR 0732 - Pastas soltas do export declaradas no `cortex.json` (`looseDirs`)

**Data:** 2026-11-14
**Status:** aceito

## Contexto

O export nativo empacota `assets/` no `assets.pak` e copia solto, para o lado do
exe, só o que a engine conhece: `config.ini`, `cortex.json`, `scenes/*.json` e a
pasta `languages/` inteira (SPEC-0124, ADR-0187).

Jogos começaram a ter outro conteúdo que precisa ficar **fora do pak** para o
usuário trocar depois do build. O primeiro caso é o Port Hollow: as rádios do
carro moram em `radios/` na raiz do jogo (índice `radios/radios.json` + uma pasta
por rádio). No Studio funciona (o Vite serve da raiz do projeto); no export a
pasta não vai e o rádio fica mudo, sem erro. O contorno era um script do jogo
copiando a pasta para o `dist-native/` depois do export.

O host não precisa de mudança: o `__cortexReadFile` (`native/src/shims/files.cpp`)
tenta o `assets.pak` e cai para `<pasta do exe>/<caminho>` para **qualquer**
caminho relativo — não há filtro por pasta.

## Decisão

O jogo declara as pastas soltas extras no **`cortex.json`**, campo
**`looseDirs`** (lista de caminhos relativos à raiz do jogo):

```json
{ "id": "port-hollow", "name": "DDD 00", "looseDirs": ["radios"] }
```

O export copia `languages` (sempre, como antes) + as pastas de `looseDirs`, cada
uma recursiva e sem filtro de extensão, para o mesmo caminho relativo no dist.
O mecanismo é genérico: a engine não sabe o que é rádio.

### Alternativas consideradas

- **Arquivo novo no jogo** (ex.: `export.json`). Rejeitada: o export já lê o
  `cortex.json` (`readGameConfig`, ADR-0126), que é o lugar das configurações de
  build do projeto (`icon`, `steamAppId`). Um segundo arquivo é mais um contrato
  para o Studio e o template conhecerem.
- **Convenção: copiar toda pasta da raiz que não for conhecida.** Rejeitada:
  levaria `node_modules/`, `tools/`, `.cortex-cache/` e rascunhos para o build do
  jogador. Lista explícita é previsível.
- **Caso especial `radios/` na engine.** Rejeitada pela regra de camada: conteúdo
  do jogo é do jogo; a engine só oferece o mecanismo.

## Consequências

- O jogo passa a declarar `"looseDirs": ["radios"]` e o contorno do jogo some.
- Nome inválido (absoluto, com `..`, vazio, não-string) **reprova o export** com
  mensagem clara: errar em silêncio é exatamente o bug que isso fecha.
- Pasta declarada e ausente é pulada sem erro (mesma regra do `languages/`).
- Conteúdo solto fica sem compressão e sem o XOR do pak (ADR-0104): é para isso
  que serve. Quem declarar `assets` duplicaria o pak em disco — não é bloqueado;
  o pak continua tendo prioridade na leitura.
- O campo não vai para o `cortex.json` do dist (só o export usa, como o `icon`).
- Detalhe do comportamento: SPEC-0733.
