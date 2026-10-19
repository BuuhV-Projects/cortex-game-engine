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

- Coluna à esquerda com um círculo por marcador (pares mostram `R` e `L`; em pt, `D` e `E`). Arrasta-se do círculo para o
  modelo; arrastar um marcador já colocado o reposiciona.
- **Ponto gravado** = onde o raio da câmera acerta a malha (o primeiro triângulo visível). Se o raio não
  acerta, o ponto fica no plano z = 0 do espaço exibido (centro do modelo). O ponto é convertido de volta
  para `gltf.scene` (desfaz a centralização e a rotação).
- **Simetria** (checkbox, ligada por padrão): mover um lado põe o outro em `x → −x` do espaço exibido
  (com a profundidade tirada do raio no ponto espelhado); `chin` e `groin` ficam presos em x = 0. Ao ligar,
  o lado que se moveu por último manda.
- Linhas de ajuda: punho–cotovelo de cada lado, e quadril estimado–joelho (quadril estimado = `(0,78·joelho.x,
  virilha.y)`, a mesma fração da SPEC-0187 do jogo).
- Posições iniciais: lidas de `tools/characters/<CODE>.markers.json` se existir (pela listagem da pasta, sem
  tentar ler arquivo ausente) (aviso se `source` ou `code`
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

## Verificação (2026-10-19)

Studio em dev com perfil temporário, projeto temporário com cópia do `LUC-01.json` e um
`prepare-character.sh` falso (sai com 3): o rosto do Lucas aparece de frente com `Ry(−90°)`; arrastar punho e
cotovelo espelha o outro lado; o queixo vindo da coluna fica em x = 0; zoom no cursor; joelho acima da virilha
bloqueia o salvar; o arquivo gravado volta às mesmas posições ao reabrir; Gerar rig roda pelo Git Bash
(`MINGW64`), mostra a saída sem ANSI e a folha no código 3; botão direito no `LUC-01.json` abre o painel. O
pipeline real (`skin` da SPEC-0187) não foi rodado daqui.

## Consequências

- O Studio não interpreta os marcadores: só grava o contrato. A derivação do esqueleto fica no jogo
  (SPEC-0187), e o painel não depende de nada específico do DDD 61 além do formato da config.
- A profundidade gravada é a do raio; o jogo usa só x e altura (SPEC-0187 §1).
- Gerar rig depende de `bash` + o script existirem no projeto; sem eles o painel mostra o erro do processo.

## Adendo 1 (2026-10-19) - prévia das animações do rig gerado

Pedido do usuário: os FBX ficam em `animations/characters/<pacote>/` do projeto, e o Studio deixa pré-visualizar
as animações depois de gerar o rig. Só personagem que já tem rig gerado pode pré-visualizar: quem diz isso é o
**registro de rigs** escrito pelo pipeline do jogo.

### Registro: `tools/characters/rigs.json` (escrito pelo jogo, só leitura aqui)

```json
{ "version": 1, "rigs": { "LUC-01": {
  "config": "tools/characters/LUC-01.json",
  "animations": "animations/characters/basic-locomotion",
  "staging":   { "glb": "<abs ou rel>", "clips": "<abs ou rel>", "at": "<ISO 8601>" },
  "published": { "glb": "<abs ou rel>", "clips": "<abs ou rel>", "at": "<ISO 8601>" },
  "clips": [ { "name": "walk", "file": "walking.fbx", "loop": true, "duration": 1.0333 } ] } } }
```

- `skin` aprovada grava `staging`; `--approve` grava `published` (pode faltar). Caminho que não começa por letra
  de unidade, `/` ou `\` é relativo ao projeto.
- `clips` = clipes da última geração; o `name` é o nome da animação dentro do GLB.
- O `rigs.json` não é config de personagem: fica fora da lista do painel e do menu de contexto.

### Comportamento

- O painel ganha três abas: **Marcadores** (o que já existia), **Animações** (prévia do rig gerado) e **Pasta**
  (seleção dos FBX). A saída do `prepare-character` fica numa coluna à direita, visível em qualquer aba.
- **Animações** fica desabilitada, com o aviso "Gere o rig deste personagem primeiro", quando o código não está
  no registro ou o GLB do build escolhido não existe (conferido pela listagem da pasta, sem ler arquivo ausente).
- Build mostrado: o mais recente entre `staging` e `published` (pelo `at`); quando os dois existem, um seletor
  alterna. A barra mostra qual é (staging/publicado) e a data.
- Prévia: GLB do registro (`readFileBase64` + `GLTFLoader`), câmera perspectiva com OrbitControls enquadrando o
  personagem, grade no chão, luz hemisférica + direcional, `AnimationMixer`. Lista de clipes do registro (nome,
  duração, laço, arquivo FBX); clicar toca. Play/pausa, velocidade 0,25×–2×, barra de tempo arrastável; laço
  conforme `loop`, com "Forçar laço" opcional. Clipe do registro que não está no GLB aparece como ausente.
  A prévia desliga `vertexColors` dos materiais: no GLB do rig o `COLOR_0` é o índice de região do jogo
  (atributo `slot`, SPEC-0185), não cor; multiplicado na textura, deixaria o boneco vermelho e preto.
  Os FBX selecionados na config que ainda não estão no rig aparecem acinzentados no fim da lista ("gere o rig de
  novo"); clicar neles não toca nada (a prévia não tem FBXLoader: só o GLB).
- Depois de **Gerar rig** terminar com 0 ou 3, o painel relê o registro e atualiza as abas Animações e Pasta.
- Botão direito num `.json` de `tools/characters/` → **Pré-visualizar animações** abre o painel direto na aba
  Animações (ou em Marcadores, com a aba desabilitada e o aviso, se o código não está no registro).
- Fechar o painel (ou trocar de personagem/build) libera mixer, geometrias, materiais, texturas e o renderer da
  prévia. O laço de desenho só roda com a aba visível.

### Seleção dos FBX (aba Pasta)

Correção do usuário (SPEC-0187 §4 do jogo): entram no rig **só** os FBX listados em `skinned.clips` da config,
`{ "<nome>": { "file": "<arq>.fbx", "loop": bool, ...flags } }`. O painel edita essa seleção na própria config.

- Pasta: `skinned.fbx` da config (relativa ao projeto ou absoluta); sem ela, `animations` do registro. Lista os
  `.fbx` da pasta (sem diferenciar caixa na extensão), em ordem alfabética, cada um com checkbox. Um FBX listado
  na config que não está na pasta aparece no fim como **ausente** (o script do jogo sai com 64); desmarcá-lo o
  remove.
- **Busca** filtra por nome do arquivo e nome do clipe, sem diferenciar maiúscula nem acento. **Marcar todos** e
  **Desmarcar todos** agem só sobre as linhas filtradas. Contador "N de M selecionadas" (M = linhas da pasta).
- Estado de cada linha: **no rig** (selecionada e em `clips` do registro, comparando o arquivo sem caixa);
  **gere o rig de novo** (selecionada, fora do registro); **não selecionada** (se ainda estiver no rig gerado, o
  aviso diz que sai na próxima geração).
- Marcar um FBX que não está em `skinned.clips` cria `{ "file": "<arq>", "loop": false }` no fim do objeto, com o
  nome camelCase do arquivo (separadores espaço, `_` e `-`, e qualquer não alfanumérico; 1ª palavra minúscula,
  demais com a inicial maiúscula: `left turn 90.fbx` → `leftTurn90`). Nome já usado por outra entrada → sufixo
  numérico `2`, `3`… (`walk` → `walk2`).
- Linha selecionada tem checkbox **laço** (grava `loop`; as outras chaves da entrada ficam).
- Desmarcar remove a entrada. Se ela tiver chave além de `file`/`loop` (`rootMotion`, `jump`…), o painel pede
  confirmação ("o jogo usa este clipe"); em massa, uma confirmação só, listando os clipes.
- Gravação: a config é **relida do disco**, a seleção é aplicada (remove, ajusta `loop`, acrescenta) e o resto do
  JSON fica igual, na mesma ordem de chaves; formato `JSON.stringify(cfg, null, 1) + '\n'` (o do jogo). Só
  grava se o texto muda. Grava em **Salvar seleção** e antes de **Gerar rig**.
- Clicar no nome de uma linha **no rig** abre a aba Animações tocando o clipe; nas outras não toca nada.

### Código

| arquivo | papel |
|---|---|
| `electron/renderer/characterRigRegistry.ts` | puro: ler/validar o registro, escolher o build, caminhos relativos/absolutos, nome camelCase |
| `electron/renderer/characterRigSelection.ts` | puro: ler `skinned.clips`, nome único, aplicar a seleção na config, linhas/estados, busca |
| `electron/renderer/RigAnimationPreview.ts` | a vista da aba Animações (three + playbar) |
| `electron/renderer/RigFbxSelection.ts` | a vista da aba Pasta (lista, busca, gravação) |
| `tests/electron/characterRigRegistry.test.ts`, `tests/electron/characterRigSelection.test.ts` | testes dos módulos puros |

### Verificação (2026-10-19)

Studio em dev com perfil temporário. Com o registro e o GLB reais do DDD 61 (só leitura): aba Animações com o
build staging, 12 clipes; walk, run (0,5×), jump (para no fim sem laço), pausa e scrub; a aba Pasta lista os 12
FBX como "no rig" com as flags do jogo. Numa cópia do projeto: personagem fora do registro com a aba desabilitada
e o aviso; busca sem acento/caixa, "Marcar todos" no filtrado, `walk.fbx` → `walk2` na colisão, laço por linha;
desmarcar `walk` pede confirmação (Cancelar mantém; em massa, uma confirmação só); o JSON gravado muda só
`skinned.clips`, com a mesma ordem e a quebra de linha final; Gerar rig (script falso) grava a seleção antes e,
com o `rigs.json` reescrito, a prévia passa ao build publicado (mais recente) e mostra o clipe novo como ausente
do GLB; botão direito → Pré-visualizar animações abre na aba. O pipeline real do jogo não foi rodado daqui.

## Adendo 2 (2026-10-19) - marcador de ombros

O jogo (SPEC-0187, adendo 2) passou a aceitar no `.markers.json` dois marcadores **opcionais**, `shoulderL` e
`shoulderR` (`[x, y, z]` no espaço `gltf`, como os outros). `version` continua 1; arquivo sem eles continua
válido (o pipeline estima o ombro). O Studio passa a **sempre** gravá-los.

- Grupo novo `shoulders` (OMBROS / SHOULDERS, violeta `#b48cff`), logo abaixo do queixo na coluna, com `D`/`E`;
  mesma interação de arrastar e simetria (`shoulderL` ↔ `shoulderR`).
- Estimativa (pose em A e em T): `y = 0,81·H`, `x = ±0,115·H` (entre o queixo, 0,87·H, e os cotovelos).
- Linha de ajuda nova: ombro–cotovelo de cada lado (cor dos ombros), além de punho–cotovelo.
- Validação nova: **ombro acima do cotovelo** em cada lado, com a mesma folga de 2 % da altura (pose em T: ombro e
  cotovelo quase na mesma altura). Código `shoulderBelowElbow`. Os 10 marcadores têm de estar colocados.
- Leitura: `shoulderL`/`shoulderR` são opcionais no arquivo (se presentes, têm de ser `[x, y, z]` válidos). Ao
  abrir um arquivo antigo, os ombros ausentes vêm da estimativa pela caixa (com a profundidade pelo raio).
- Gravação: ordem `chin, shoulderL, shoulderR, wristL, wristR, elbowL, elbowR, kneeL, kneeR, groin` (a ordem não
  importa ao leitor).

## Adendo 3 (2026-10-19) - caminhos da config relativos ao projeto

O pipeline do jogo não pode referenciar nada fora do projeto: em `tools/characters/<CODE>.json`, `source`, `work` e
`skinned.fbx` passam a ser **relativos ao diretório do projeto** (ex.: `"source":
"assets/personagens/fontes/LUC-01/lucas-rocha-base-fosco.glb"`, `"work": "assets/personagens/fontes/LUC-01/.work"`,
`"skinned": { "fbx": "assets/animations/characters/basic-locomotion" }`).

- O Studio resolve os três contra o projeto aberto (mesma regra do registro: relativo → `<projeto>/<caminho>`,
  aceitando `./` e `\`); caminho absoluto continua aceito como está (compatibilidade com configs antigas).
- GLB lido de `resolve(source)`; folha de revisão em `resolve(work)/skinned/previa/folha.png`; pasta dos FBX em
  `resolve(skinned.fbx)` (já era assim desde o adendo 1).
- O `.markers.json` grava `source` com o **mesmo texto** da config (relativo, se ela for relativa).
- O aviso de `source` divergente compara os caminhos **resolvidos** (ignorando `\` × `/`, `./`, barras repetidas e
  caixa): `assets/x.glb` no arquivo e `D:/jogo/assets/x.glb` na config são o mesmo.
