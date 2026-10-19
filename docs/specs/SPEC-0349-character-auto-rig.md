# SPEC-0349 - character-auto-rig: marcar o corpo de um personagem GLB no Studio

**Data:** 2026-10-19
**Status:** aceito
**Jogo:** SPEC-0187 do DDD 61 (`D:/jogos/detetive-brasilia`), que lê o arquivo gravado aqui.

## Contexto

O DDD 61 gera o esqueleto Mixamo do player pela etapa `skin` de `tools/prepare-character.sh`
(SPEC-0185 do jogo). Até agora as juntas vinham de um rig de referência e de números escritos à mão na
config do personagem. A SPEC-0187 do jogo troca isso por **oito marcadores** colocados pelo usuário no
corpo do personagem, como no auto-rigger do Mixamo (queixo, pulsos, cotovelos, joelhos, virilha). Falta
o lugar para marcar: um painel do Studio.

## Comportamento

### Entrada

- Menu **Projeto → Auto-rig de personagem…** (evento `character-rig-requested`).
- Botão direito num `.json` dentro de `tools/characters/` na árvore do projeto (menos `defaults.json` e
  `*.markers.json`) → **Auto-rig de personagem…** com aquele arquivo pré-selecionado.
- O painel lista as configs `tools/characters/*.json` do projeto aberto que têm a seção `skinned`. Sem
  nenhuma, avisa e não abre.

### Config lida (do jogo, só leitura)

`code`, `source` (caminho absoluto do GLB, pode estar fora do projeto), `transform.rotateZDeg` (graus,
padrão 0), `work` (pasta de trabalho, para achar a folha de revisão), `skinned` (precisa existir).

### Viewport

- `<dialog>` grande com câmera **ortográfica frontal** (olha para −Z), luz hemisférica + direcional,
  linha vertical em x = 0. Roda do mouse dá zoom no ponto do cursor; botão do meio ou direito arrasta
  (pan); duplo clique no fundo reenquadra.
- **Espaço exibido**: `d = Ry(rotateZDeg) · p − c`, onde `p` é o ponto em `gltf.scene` e `c = (cx, 0, cz)`
  é o centro da caixa do modelo **já girado** no plano XZ. Ou seja: o modelo é girado em torno de Y e
  centralizado em x = 0, z = 0, sem mexer na altura.
- **Sinal da rotação:** o Blender importa o glTF com `(x, y, z)_blender = (x, −z, y)_gltf`. `Rz(θ)` do
  Blender, escrito no glTF, é exatamente `Ry(θ)` do three.js (mesmo sinal). A frente do Blender (−Y) é +Z
  do glTF, que é o lado virado para a câmera. Conferido no LUC-01 (`rotateZDeg = −90`): o rosto aparece de
  frente.
- **L/R** é o lado do personagem. De frente para a câmera, o `L` fica à **direita** da tela (x > 0 no
  espaço exibido).

### Marcadores

| id | grupo | cor |
|---|---|---|
| `chin` | CHIN / QUEIXO | ciano `#22d3ee` |
| `wristL`, `wristR` | WRISTS / PULSOS | verde-limão `#a3e635` |
| `elbowL`, `elbowR` | ELBOWS / COTOVELOS | amarelo `#facc15` |
| `kneeL`, `kneeR` | KNEES / JOELHOS | laranja `#fb923c` |
| `groin` | GROIN / VIRILHA | rosa `#f472b6` |

- Coluna à esquerda com um círculo por marcador (pares mostram `R` e `L`). Arrasta-se do círculo para o
  modelo; arrastar um marcador já colocado o reposiciona.
- **Ponto gravado** = onde o raio da câmera acerta a malha (o primeiro triângulo visível). Se o raio não
  acerta, o ponto fica no plano z = 0 do espaço exibido (centro do modelo). O ponto é convertido de volta
  para `gltf.scene` (desfaz a centralização e a rotação).
- **Simetria** (checkbox, ligada por padrão): mover um lado põe o outro em `x → −x` do espaço exibido
  (com a profundidade tirada do raio no ponto espelhado); `chin` e `groin` ficam presos em x = 0. Ao ligar,
  o lado que se moveu por último manda.
- Linhas de ajuda: punho–cotovelo de cada lado, e quadril estimado–joelho (quadril estimado = `(0,78·joelho.x,
  virilha.y)`, a mesma fração da SPEC-0187 do jogo).
- Posições iniciais: lidas de `tools/characters/<CODE>.markers.json` se existir (aviso se `source` ou `code`
  não baterem com a config). Senão estimadas pela caixa do modelo exibido, em frações da altura `H` e da
  largura `W` (pose em T quando `W > 0,8·H`, senão pose em A):

  | marcador | y | x |
  |---|---|---|
  | chin | 0,87·H | 0 |
  | groin | 0,50·H | 0 |
  | joelhos | 0,27·H | ±0,055·H |
  | punhos (T / A) | 0,80·H / 0,53·H | ±0,40·W / ±0,42·W |
  | cotovelos (T / A) | 0,80·H / 0,66·H | ±0,22·W / ±0,30·W |

### Validação (antes de salvar e de gerar)

Todos os 8 colocados; queixo acima da virilha; cotovelo acima do punho em cada lado (com folga de 2 % da
altura, para a pose em T, onde os dois ficam na mesma altura); joelho abaixo da virilha em cada lado. A
lista de erros aparece no painel; nada é gravado enquanto houver erro.

### Arquivo gravado: `tools/characters/<CODE>.markers.json`

Contrato fixado pela SPEC-0187 do jogo; JSON com 2 espaços de indentação e quebra de linha final; números
arredondados a 0,1 mm (4 casas).

```json
{
  "version": 1,
  "code": "LUC-01",
  "source": "<igual à config>",
  "space": "gltf",
  "symmetry": true,
  "markers": { "chin": [x, y, z], "groin": [x, y, z], "wristL": [x, y, z], "wristR": [x, y, z],
               "elbowL": [x, y, z], "elbowR": [x, y, z], "kneeL": [x, y, z], "kneeR": [x, y, z] }
}
```

### Gerar rig

**Gerar rig** = salvar + IPC `characterRig:run(projectDir, configRel)`, que roda
`bash tools/prepare-character.sh --config tools/characters/<CODE>.json` com `cwd` = projeto. A saída vem
por `characterRig:output` (texto, sem códigos ANSI na tela) e o IPC resolve com o código de saída. Um
processo por vez (separado do terminal embutido); **Parar** (`characterRig:stop`) mata o processo.

- No Windows o `bash` é o do **Git** (`Program Files\Git\bin\bash.exe`, ou ao lado do `git` do PATH); o
  `bash.exe` do `System32` é o WSL e não enxerga `D:/…` do mesmo jeito. Sem Git Bash o IPC devolve código 2
  com a explicação.
- Código de saída: `0` aprovado, `1` reprovado (mostra a saída), `2` infraestrutura, `3` aguardando revisão
  visual: mostra `<work>/skinned/previa/folha.png` se existir. Outro código é tratado como falha.

### Código

| arquivo | papel |
|---|---|
| `electron/renderer/characterRig.ts` | módulo **puro** (sem DOM nem three): marcadores, conversão de espaço, simetria, estimativa, validação, (de)serialização, leitura da config, código de saída |
| `electron/renderer/CharacterRigPanel.ts` | o `<dialog>` (three.js + overlay SVG dos marcadores) |
| `electron/main.ts` | IPC `characterRig:run` / `characterRig:stop` |
| `tests/electron/characterRig.test.ts` | testes do módulo puro |

Logs com `debug('characterRig', …)`.

## Consequências

- O Studio não interpreta os marcadores: só grava o contrato. A derivação do esqueleto fica no jogo
  (SPEC-0187), e o painel não depende de nada específico do DDD 61 além do formato da config.
- A profundidade gravada é a do raio; o jogo usa só x e altura (SPEC-0187 §1).
- Gerar rig depende de `bash` + o script existirem no projeto; sem eles o painel mostra o erro do processo.
