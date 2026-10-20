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

## Adendo 4 (2026-10-19) - ajuste dos braços por animação (Character Arm-Space)

O jogo (SPEC-0187, adendo 3) aceita em cada entrada de `skinned.clips` da config três campos opcionais, em
**graus** (padrão 0), aplicados pelo retarget e gravados no GLB (o jogo não faz nada em tempo de execução), como o
"Character Arm-Space" do Mixamo:

- `shoulderLift`: sobe (+) / desce (−) os ombros — gira a clavícula (`LeftShoulder`/`RightShoulder`) e, pela
  hierarquia, o braço inteiro.
- `armSpace`: abre (+) / fecha (−) os braços — gira o braço (`LeftArm`/`RightArm`) e, pela hierarquia, antebraço
  e mão.
- `elbowSpace` (acréscimo do mesmo dia, pedido depois do teste com ombro +20°, em que o cotovelo abria e a mão
  voltava ao quadril): abre (+, mão para fora) / fecha (−) os antebraços — gira antebraço (`LeftForeArm`/
  `RightForeArm`) e mão em volta do mesmo eixo, com pivô no cotovelo.

O JSON do skin de cada build (`staging.clips`/`published.clips` do registro) traz em `clips[nome].armOffsets =
{ shoulderLift, armSpace, elbowSpace }` o ajuste que **foi aplicado** naquela geração; ausente = 0 (campo a campo).

### Matemática (a mesma do `arm_offsets` do `character_skin.py`)

- Eixo = frente do peito no quadro: `a = (W_Spine2 · W_Spine2_repouso⁻¹) · F`, W = rotação do osso no espaço do
  modelo, F = frente do personagem no repouso (+Z no GLB/three.js; −Y no Blender).
- Lado esquerdo (`Left*`, +X do modelo) gira +θ em volta de `a`; o direito, −θ.
- Clavícula: `W' = R(a, ±lift) · W`. Braço: `W' = R(a, ±space) · R(a, ±lift) · W`. Antebraço e mão:
  `W' = R(a, ±elbow) · R(a, ±space) · R(a, ±lift) · W`. Os filhos seguem.
- Na prévia, depois do `mixer.update` de cada quadro: rotação de mundo R no osso b → `b.quaternion = P⁻¹ · R · P ·
  b.quaternion` (P = rotação do pai no espaço do modelo); primeiro a clavícula (R(a, ±lift)), depois o braço, que
  já herdou o lift (R(a, ±space)), e por último o antebraço, que já herdou os dois (R(a, ±elbow)). A pose do mixer nesses ossos é guardada antes do ajuste e restaurada antes de
  cada `mixer.update` (e do scrub): o `PropertyMixer` do three só reescreve o osso quando o valor do clipe muda, então
  sem isso o ajuste somaria a cada quadro com a prévia pausada ou num quadro repetido.

### Comportamento (aba Animações)

- Abaixo da barra de reprodução, para o clipe tocando: **Altura dos ombros** (−20° a +20°), **Abertura dos
  braços** (−20° a +30°) e **Abertura dos antebraços** (−30° a +30°), passo 0,5°, com o valor numérico editável (mesmo intervalo, arredondado ao passo) e um
  botão **zerar** cada. Sem clipe tocando, ou com um clipe que não está em `skinned.clips` da config, os controles
  ficam desabilitados com o aviso.
- Valores iniciais: os da config no disco (`skinned.clips[nome]`), relida ao abrir o personagem e depois de
  Gerar/Publicar/Desfazer; um ajuste ainda não salvo continua valendo depois da releitura.
- **Prévia = GLB + diferença.** O GLB do build mostrado já tem o `armOffsets` daquela geração; a prévia aplica
  só `valor do slider − armOffsets` (do JSON do skin desse build). Assim ela mostra como o clipe vai ficar na
  próxima geração, sem somar o ajuste duas vezes. JSON do skin ilegível ou sem o campo → 0 (é o que o jogo
  grava quando não houve ajuste; um JSON anterior ao adendo 3 do jogo também não tem o campo).
- Estados mostrados por clipe: valor diferente do gerado → "alterado: gere o rig de novo" (na linha do clipe e
  ao lado dos sliders); diferente da config no disco → "não salvo".
- **Salvar ajustes** relê a config do disco, grava `shoulderLift`/`armSpace`/`elbowSpace` de cada clipe alterado (campo
  existente fica na posição; novo vai no fim da entrada; valor 0 remove o campo), mantém o resto e a ordem das
  chaves, `JSON.stringify(cfg, null, 1) + '\n'`, e só grava se o texto muda. **Gerar rig** salva os ajustes
  antes (depois dos marcadores e da seleção dos FBX).

### Código

| arquivo | papel |
|---|---|
| `electron/renderer/characterRigArmSpace.ts` | puro: limites/clamp, leitura da config e do JSON do skin, diferença, gravação na config, quaternions e a rotação dos ossos |
| `electron/renderer/RigAnimationPreview.ts` | sliders, estado por clipe, aplicação no quadro e gravação |
| `tests/electron/characterRigArmSpace.test.ts` | testes do módulo puro (abrir ±X, subir a ponta da clavícula, diferença, gravação) |

## Adendo 5 (2026-10-19) - ombros pra trás e "aplicar a todos os clipes"

O jogo (SPEC-0187, adendo 3) passou a aceitar um quarto campo opcional em `skinned.clips[nome]`, também em graus
(padrão 0): **`shoulderBack`** — leva os ombros pra trás (+) / pra frente (−), abrindo o peito. O JSON do skin grava
`armOffsets.shoulderBack` com o valor aplicado (ausente = 0, como os outros).

### Matemática (a mesma do `arm_offsets` do `character_skin.py`)

- Eixo = **vertical** do peito no quadro: `u = (W_Spine2 · W_Spine2_repouso⁻¹) · UP` (UP = +Y no GLB/three.js;
  +Z no Blender). Lado esquerdo (`Left*`, +X) gira +θ em volta de `u`; o direito, −θ. Com o personagem de frente
  pra +Z, +θ leva a ponta da clavícula esquerda (e a direita) para −Z (trás).
- Na clavícula a rotação de mundo passa a ser `R_clav = R(a, ±lift) · R(u, ±back)` (nessa ordem); braço e
  antebraço continuam como no adendo 4 (`R(a, ±space)` e `R(a, ±elbow)`) e herdam a clavícula pela hierarquia.

### Comportamento

- Quarto controle no bloco de ajuste, numa linha própria: **Ombros pra trás**, −20° a +30°, passo 0,5°, com número
  e **zerar**. Gravado/omitido, estado "não gerado" e diferença na prévia iguais aos outros três.
- **Aplicar a todos os clipes**: botão no rodapé do bloco. Pede confirmação (`confirmDialog`, dizendo quantos
  clipes de `skinned.clips` recebem os valores), copia os 4 valores do clipe atual para **todos** os clipes de
  `skinned.clips` e grava na hora: relê a config do disco, mesmo formato do Salvar (`JSON.stringify(cfg, null, 1) +
  '\n'`, ordem preservada, 0 omitido, só grava se o texto muda). Edições pendentes de outros clipes são
  substituídas pelos valores aplicados. Os selos "ajuste não gerado" da lista são refeitos.

### Código

`characterRigArmSpace.ts` ganha `shoulderBack`, `MODEL_UP`, `chestUp` e `applyArmOffsetsToAll`; `sideRotations`
passa a receber os dois eixos. Testes em `tests/electron/characterRigArmSpace.test.ts`.

## Adendo 6 (2026-10-19) - vários pacotes de animação na aba Pasta

O jogo (SPEC-0187 §4, "Vários pacotes") passou a guardar os FBX em subpastas (pacotes) de
`assets/animations/characters/` (`basic-locomotion/`, `pistol-locomotion/`…). Contrato:

- `skinned.fbx` aponta para a **raiz** dos pacotes (`"assets/animations/characters"`) e cada entrada de
  `skinned.clips` guarda `file` **relativo a essa raiz**, com a subpasta e barra `/`:
  `"basic-locomotion/walking.fbx"`, `"pistol-locomotion/pistol walk.fbx"`.
- Config antiga (`skinned.fbx` apontando direto para um pacote, `file` sem barra) continua válida: a raiz é sempre
  `skinned.fbx` e `file` é sempre relativo a ela; os FBX direto na raiz formam o grupo da própria raiz.
- O registro `rigs.json` passa a ter `animations` = a raiz e `clips[].file` com a subpasta.

### Comportamento (aba Pasta)

- Lista os `.fbx` a partir de `skinned.fbx` **recursivamente** (subpastas que começam com `.` ficam de fora),
  cada um pelo caminho relativo à raiz com `/` (barras `\` do Windows normalizadas).
- Agrupada por **pacote** (a pasta do arquivo, relativa à raiz; os da própria raiz formam o grupo com o nome da
  pasta raiz), pacotes em ordem alfabética, arquivos em ordem alfabética dentro de cada um. Cabeçalho por pacote
  com o contador "N de M selecionadas" do pacote e botões **Marcar**/**Desmarcar** que agem nas linhas filtradas
  daquele pacote; o contador geral da barra continua (total de todos os pacotes). FBX listado na config e ausente
  do disco vai para o fim do seu pacote como **ausente**.
- **Busca** vale em todos os pacotes: nome do arquivo, pacote e nome do clipe (sem caixa nem acento). Pacote sem
  nenhuma linha no filtro some. **Marcar todos**/**Desmarcar todos** agem sobre o filtrado (de todos os pacotes).
- Estados por linha como antes, comparando `file` (normalizado: `/`, sem `./`, sem caixa) com o caminho relativo.
  O `file` do registro é rebaseado da pasta `animations` do registro para a raiz da config quando estão uma
  dentro da outra (registro antigo com `animations` = o pacote e `file` sem subpasta continua batendo).
- **Nome automático** de clipe novo: camelCase do nome do arquivo, sem a pasta (`pistol walk.fbx` →
  `pistolWalk`); se já for de outro clipe, prefixa o pacote em camelCase (`pistol-locomotion/idle.fbx` →
  `pistolLocomotionIdle`); se ainda colidir, sufixo numérico no nome com prefixo (`…Idle2`); arquivo da raiz
  (sem pacote) vai direto ao sufixo.
- Gravação igual ao adendo 1: relê do disco, `file` com o caminho relativo à raiz (`/`), nome pela regra acima,
  resto e ordem preservados, `JSON.stringify(cfg, null, 1) + '\n'`, confirmação ao desmarcar clipe com flags.

### Aba Animações

A lista de clipes do registro (e os pendentes) mostra o pacote ao lado do arquivo: `pistol-locomotion · pistol
walk.fbx`; arquivo sem subpasta mostra só o arquivo.

### Código

`characterRigSelection.ts` ganha `normalizeRelPath`, `packageOf`, `fileBaseName`, `autoClipName`,
`rebaseRigFile`, `listFbxRecursive` (com o `readDir` injetado) e `groupRows`; `buildRows` recebe caminhos
relativos e o rebase do registro; `filterRows` busca também no pacote. Testes em
`tests/electron/characterRigSelection.test.ts` (as duas formas de config, `idle.fbx` em dois pacotes, barras
do Windows). `fileLabel` (rótulo da aba Animações) e `camelCase` (em `characterRigRegistry.ts`) completam.

### Verificação (2026-10-19)

Studio em dev com perfil temporário, sem abrir projeto (o Play não sobe), numa cópia do DDD 61 com a config nova
(`skinned.fbx` = raiz) e o `rigs.json` antigo (`animations` = `basic-locomotion`, `file` sem subpasta): a aba
Pasta mostra `basic-locomotion` (12 de 12, todos "no rig" pelo rebase) e `pistol-locomotion` (0 de 20); a busca
"walk" acha linhas dos dois pacotes; marcar `pistol walk.fbx` e salvar acrescenta só
`"pistolWalk": { "file": "pistol-locomotion/pistol walk.fbx", "loop": false }` no fim de `skinned.clips`; a aba
Animações lista o pendente como `pistol-locomotion · pistol walk.fbx`. Gerar rig não foi rodado.

## Adendo 7 (2026-10-20) - giro do braço e do antebraço

Pedido do usuário: rotacionar braço e antebraço por clipe, além de abrir/fechar. Contrato do jogo: SPEC-0187,
seção 8 (`armTwist`, `foreArmTwist`, em graus, + = rotação externa, palma pra frente).

### Matemática (a mesma do `arm_offsets` do `character_skin.py`)

`twistRotation(dir, sign, θ) = R(dir, −sign·θ)`, com `dir` a direção do osso no quadro **já girado** (do
pivô dele ao do filho). Ordem por lado: clavícula, abertura do braço, **giro do braço** (dir = braço →
antebraço), cotovelo, **giro do antebraço** (dir = antebraço → mão). A prévia lê `dir` com
`getWorldPosition` depois de cada passo, então cada eixo já inclui os giros anteriores.

### Comportamento

- Aba Animações: dois sliders novos, "Girar o braço" (±60°) e "Girar o antebraço" (±90°), passo de 0,5°,
  com o mesmo salvar, zerar e "aplicar a todos" (agora copia os 6 valores). As mensagens de estado e de
  confirmação listam os giros.
- Config sem os campos = 0. O JSON do skin antigo, sem os campos, também = 0.

### Código

`characterRigArmSpace.ts` (chaves, limites, `twistRotation`, osso da mão em `ARM_SIDES`),
`RigAnimationPreview.ts` (passos de torção em `applyArmOffsets`, `boneDir`), i18n pt/en. Testes em
`tests/electron/characterRigArmSpace.test.ts`: sinal dos dois lados, cotovelo e mão parados no giro do
braço reto, braço parado no giro do antebraço, eixo do osso já aberto, limites, leitura e delta.

### Correção (2026-10-20): braço girando sem parar na prévia

Com os giros, braço e antebraço passaram a ser salvos duas vezes por quadro (abertura e depois giro). A
restauração do quadro seguinte copiava os valores salvos na ordem direta, e o que ficava era o salvo no meio
(já com o primeiro passo). Com a prévia pausada ou na linha do tempo, o mixer não reescreve os ossos, então
esse resto se somava a cada quadro e o braço girava sem parar ao mexer no slider. Agora a restauração é na
ordem inversa (`undoInReverse`), e o teste falha na ordem antiga.

## Adendo 8 (2026-10-20) - pose por clipe, junta a junta, na aba Animações

Pedido do usuário: clicar num osso da prévia e posicioná-lo onde quiser, arrastando livre ou pelas setas
X/Y/Z, por animação. **Cada junta sozinha, sem espelho** (decisão do usuário). Vale para o clipe inteiro,
como os sliders de braço; editar quadro a quadro fica para depois.

### Contrato do jogo (SPEC-0187, seção 9)

`skinned.clips[nome].pose = { "<osso Mixamo>": [x, y, z, w] }`, com R no espaço do modelo do GLB (o
`model` carregado na prévia), medida com o pai no repouso. Só os 22 ossos Mixamo (sem `*Helper`). O JSON
do skin grava o aplicado em `clips[nome].poseOffsets`. Conta (a mesma do `pose_offsets` do pipeline), na
ordem da hierarquia, com W = rotação de mundo do osso no espaço do modelo:

- P = W_pai · W_pai_repouso⁻¹, com o repouso lido do GLB carregado (antes do mixer), como o `chestRest`;
- C = W'_pai · W_pai⁻¹;
- W'_n = C · P · R · P⁻¹ · W_n; sem R, W'_n = C · W_n.

Gabarito: `tests/electron/fixtures/characterRigPose.golden.json` (gerado pelo pipeline no Blender, por
`scripts/blender/character_pose_golden.py` do jogo). A função pura do Studio tem que reproduzir o
`expected` a partir de `parents`, `order`, `rest`, `frame` e `pose` (tolerância 1e-6 em `1 − |q·q'|`).

### Prévia

- **Pose do build:** como nos sliders, o GLB já traz a pose gerada (`poseOffsets`). A prévia aplica por cima
  só a diferença entre a pose desejada (config + edição não salva) e a gerada: por osso, D = R_desejado ·
  R_gerado⁻¹ (ausente = identidade), com a mesma conta. É exato quando um osso muda e aproximado em cadeia;
  fica exato depois de Gerar rig, como os sliders.
- Aplica depois dos ajustes de braço, na mesma pilha de desfazer do quadro (`undoInReverse`).

### Interface (aba Animações, com um clipe tocando ou pausado)

- **Esqueleto por cima do modelo:** linha de cada osso e uma bolinha em cada junta (os 22 ossos Mixamo),
  desenhados sem teste de profundidade, para aparecer através da malha. Botão "Mostrar esqueleto" (ligado
  ao entrar no modo de pose). A junta sob o mouse acende; a selecionada tem outra cor.
- **Selecionar:** clique na bolinha (raycast contra as bolinhas, com raio em pixels de tela para ser fácil
  de acertar). Clique no vazio ou `Esc` tiram a seleção. O nome do osso aparece no painel.
- **Modo Mover (`W`):** setas X/Y/Z do `TransformControls` (translate, espaço do mundo) na junta
  selecionada, mais arrastar a própria bolinha **livre** (no plano da câmera que passa pela junta). Mover
  uma junta gira os ossos de cima para ela chegar lá, sem mudar comprimento:
  - mão (`*Hand`) ou pé (`*Foot`): IK de dois ossos (braço e antebraço / coxa e perna), mantendo o plano
    da dobra (o polo é o cotovelo/joelho atual); fora do alcance, estica até o limite;
  - outra junta: gira o osso pai para apontar para ela (menor arco), por exemplo arrastar o cotovelo gira
    o braço;
  - `Hips`: não move (só gira).
- **Modo Girar (`E`):** argolas do `TransformControls` (rotate) no osso selecionado. Botão de espaço
  mundo/local.
- Cada edição vira a rotação de mundo G aplicada ao osso no quadro mostrado e atualiza R do osso:
  Rf_novo = C⁻¹ · G · C · P · R_velho · P⁻¹ e R_novo = P⁻¹ · Rf_novo · P (P e C do quadro mostrado). A
  edição continua valendo com o clipe tocando (a pose é do clipe inteiro).
- Enquanto arrasta, `OrbitControls` desliga; Ctrl+Z desfaz a última edição de pose do clipe (pilha por
  clipe, só da sessão).
- **Painel "Pose (deste clipe)":** lista os ossos com pose (nome, ângulo total em graus), "zerar osso",
  "zerar pose do clipe", "Salvar pose" (grava `pose` na config, com 6 casas; identidade remove a entrada;
  sem ossos remove o campo; o resto do JSON fica igual, como o `applyArmOffsets`) e "Aplicar a todos os
  clipes" (com confirmação). O estado diz se a pose gerada difere da desejada ("gere o rig de novo").
- Trocar de clipe ou de build com pose não salva pede confirmação, como os sliders.
- Tudo com i18n pt/en.

### Aceite

1. Função pura da conta reproduz o gabarito; testes também de: R → G → R (ida e volta), IK de dois ossos
   (a mão chega ao alvo dentro do alcance, comprimentos iguais, plano da dobra mantido; fora do alcance
   estica na direção do alvo), apontar o osso pai (menor arco), leitura e gravação da config (ordem dos
   campos preservada, identidade some), diferença desejado × gerado.
2. Na prévia real com o LUC-01: selecionar o antebraço esquerdo, arrastar a mão pelo eixo X e soltar → a mão
   fica onde parou com o clipe pausado e tocando, sem girar sozinha nem acumular (o bug do adendo 7);
   Salvar grava só os ossos mexidos; Gerar rig e reabrir → a prévia sem diferença fica igual à pose editada.
3. Sem pose, a aba Animações fica igual a antes (mesmos testes verdes).
