---
name: level-design-plataforma
description: Critérios visuais e de desafio (composição, ritmo, verticalidade, beleza) pra DESENHAR mapas/fases de plataforma-obstáculo a partir de kits 3D, destilados por medição do mapa profissional Platformer_Deathrun. Use ao construir, desenhar ou expandir um mapa, fase, percurso ou "obstacle course" de plataforma com assets. Camada de design — combine com a skill montar-jogo (método de construção).
---

# Level design de plataforma-obstáculo (critérios do Deathrun)

Estes critérios foram **medidos** no mapa `Platformer_Deathrun.blend` (1918 peças,
percurso de ~231 m), não inventados — é o "idioma criativo" de um mapa que funciona.
Quando o usuário pedir um mapa/fase com esses kits, **aplique todos**. A `montar-jogo`
diz *como construir e validar*; esta diz *como fazer bonito e desafiador*.

> Scripts de medição (vêm junto da skill, reusar em kits novos):
> `dump_blend.py` (estrutura: coleções, instâncias, bbox, histograma) e
> `dump_creative.py` (critérios: verticalidade, scatter, paleta, cadência).
> Resolva o caminho por variável — a skill roda no repositório da engine e também
> no Chat IA do Studio, onde o `cwd` é o projeto do jogo:
>
> ```bash
> PLUGIN="${CORTEX_PLUGIN_DIR:-.claude}"
> LD="$PLUGIN/skills/level-design-plataforma/scripts"
> BLENDER=$(node "$PLUGIN/scripts/check-blender.mjs") || exit 1   # obrigatório
> "$BLENDER" --background <arquivo.blend> --python "$LD/dump_blend.py"
> ```
>
> **Blender é pré-requisito duro** de toda medição e de todo porte de mapa: se a
> checagem falhar, PARE e reporte ao usuário — medir "no olho" é exatamente o que
> esta skill existe para evitar. Os critérios de design abaixo continuam válidos
> para revisar um mapa, mas nenhum passo que peça Blender pode ser improvisado.

## A forma do mapa (o esqueleto)

- **Corredor linear** ao longo de UM eixo de progressão (o mais longo). Não é mundo
  aberto: é uma pista com começo e fim.
- **Lane emoldurada**: o chão (`grass`/`land`) é **ladeado por cercas** dos dois lados
  (`fence_pillar` + `fence_wood`) — a cerca é o que dá "trilho" e leitura de para onde ir.
  Foi a categoria mais numerosa do mapa (528 chão, 741 cerca/traversal). Sem moldura o
  percurso vira sopa.
- **Segmentado por checkpoints**: ~1 `checkpoint` (+`checkpoint_tree` de par visual) a
  cada ~30–40 m. **Cada trecho checkpoint→checkpoint é uma "fase"** com arco próprio —
  é assim que se troca "5 fases à mão" por trechos de um percurso coeso.

## Os 7 critérios (aplicar SEMPRE)

### 1. Curva de tensão: beleza e desafio são INVERSAMENTE proporcionais
Medido por fatia: onde o hazard sobe, a decoração cai; onde é calmo, enche de beleza.
O arco do mapa inteiro:
- **Intro** (1º trecho): pouco perigo, MUITA decoração — entrada bonita e convidativa
  que ensina o movimento sem punir (faixa 0: 8 hazards, 60 decor).
- **Desenvolvimento**: perigo moderado alternado com respiros decorados.
- **Clímax**: pico de hazard com a decoração **removida** — austero, foco puro no
  desafio (faixa 7–8: 35 e 33 hazards, decor despenca 30→5). No Deathrun é um
  **gauntlet de explosivos** (bomba/dinamite/TNT amontoados).
- **Resolução**: perigo zero, decoração no talo + bandeiras de chegada — jardim de
  vitória (faixa 11: 0 hazard, 56 decor, 8 markers).

Regra: **decore os vales, esvazie os picos.** Beleza é respiro; austeridade é aviso.

### 2. Verticalidade: o chão ondula, o clímax fica no alto
O piso NÃO é plano — sobe e desce (amplitude ~10–18 m ao longo do percurso). O ponto
mais alto coincide com o clímax (faixa 8, Z médio salta pra ~10) e **depois desce**
(alívio). Faça colinas suaves; ponha a seção mais difícil numa **elevação estreita**;
use a descida como recompensa/velocidade.

### 3. Pinch points: estreite a pista nos picos de dificuldade
A largura da lane varia — larga nos trechos calmos, **estreita nos picos** (faixa 3 e
o clímax faixa 8 afunilam a ~metade). Menos espaço = mais tensão. Alargue pra respirar,
afunile pra apertar.

### 4. Cadência de desafio: clusters densos + respiros claros
Hazards vêm em **rajadas** (~2 m entre si dentro de uma seção — mediana medida 2,2 m),
separadas por **gaps grandes de respiro** (até ~20 m sem perigo). Nunca espalhe perigo
uniforme: agrupe num "puzzle" e dê o vazio pro jogador recuperar. Um pico de perigo por
trecho de checkpoint.

### 5. Scatter natural vs. rigor funcional (a regra visual mais importante)
Medido: natureza/decoração tem rotação e escala **randomizadas** (63–73 rotações
distintas por categoria; escala 0,55–2,6; até **espelhamento** com escala negativa) →
orgânico, sem repetição óbvia. Já os **markers de gameplay têm só ~4 rotações e escala
1,0–1,2** → alinhados e uniformes.

Regra dupla:
- **Decor/natureza** (árvore, arbusto, flor, pedra, tronco): **rotação Z aleatória +
  escala variada (±) + espelhar** pra parecer natural. Agrupar em moitas, não em grade.
- **Gameplay** (checkpoint, coin, hazard, finish, trampolim): **eixo-alinhado, escala
  consistente, orientação previsível.** Peça funcional tem que LER como funcional.

### 6. Paleta coesa: poucos materiais, cor chapada, emissão só pro que importa
O mapa usa **~9 materiais** (um "Color" domina; + madeira, corda, água) — cor stylized
flat, não textura fotográfica. **Emission é reservada** (11 usos) pros elementos de
gameplay que precisam brilhar (coin/finish/checkpoint). Não misture packs de idiomas
visuais diferentes (regra da montar-jogo). Emissão/brilho = "interaja comigo".

### 7. Leitura e enquadramento (profundidade + clareza)
- **Camadas de profundidade**: vegetação baixa em primeiro plano, árvores/pedras
  grandes ao fundo/nas laterais fora da pista → dá volume sem poluir o caminho.
- **A cerca emoldura e guia** o olho pro fim.
- **Nada de decoração camuflando hazard**: o perigo tem que ser lido a tempo de reagir
  (reforça o critério 1 — clímax sem decor). Coin/checkpoint com brilho, hazard com
  silhueta limpa e contrastante.

## Receita de um trecho (checkpoint → checkpoint)

Cada "fase" segue o micro-arco do mapa inteiro:
1. **Entrada** logo após o checkpoint: calma, decorada, largura cheia — respiro/leitura.
2. **Desafio**: 1 cluster de hazards (~2 m entre peças), pista afunilando, talvez subida.
   Uma mecânica-tema por trecho (explosivos / troncos rolando / trampolins / pontes).
3. **Recompensa**: coins na linha de risco (risco↔ganho), descida/trampolim pro próximo
   checkpoint. Bandeiras (`flag`) em pares marcando o progresso a cada ~15–20 m.

Escale a dificuldade **entre** trechos: cada checkpoint sobe um degrau (mais denso, mais
estreito, mais alto). Último trecho antes do finish = o gauntlet; depois, jardim seguro.

## Vocabulário → papel (kit Deathrun)

| Papel | Peças |
|---|---|
| Chão / pista | `grass`, `land`, `landscape` |
| Moldura / trilho | `fence_pillar`, `fence_wood`, `fence`, `barrier` |
| Hazard | `obstacle_1..14`, `bomb`, `dynamite`, `box_tnt`, `anvil`, `cannon`, `stake`+`rope` |
| Traversal | `trampoline`, `bridge`, `ladder`, `big_log`, `log` |
| Marker (brilho/UI) | `checkpoint`(+`_tree`), `flag`, `finish`, `coin`, `indicator`, `signboard` |
| Decor natural (scatter) | `tree`, `bush`, `flower`, `rock`, `stone`, `pumpkin`, `hive`, `berries` |

## Converter um mapa autorado no Blender numa fase (porter)

Quando o mapa já existe num `.blend` (ex.: `Platformer_Deathrun`), dá pra portá-lo
pro Studio como fase, em vez de remontar à mão. Fluxo provado (fase 6 do teste4):

1. **Extrair a cena via API do Blender** (`$LD/blender_export_scene.py`): pega a
   coleção do NÍVEL (ex.: `Demonstration`, não o showroom `Assets`), converte cada
   objeto pra ESPAÇO-ENGINE (`Matrix.Rotation(-90°, X)` = convenção do exporter glTF,
   Z-up→Y-up), decompõe em pos/rotação(euler XYZ rad)/escala e classifica por nome.
   Roda: `"$BLENDER" --background <arq.blend> --python "$LD/blender_export_scene.py" -- <out.json>`.
2. **Gerar a fase** (`$LD/convert_map_to_phase.mjs`, calibrado ao `CourseData` do
   teste4): cada peça vira um nó `model` (`transform.rotation` em RAD) referenciando o
   arquivo do kit; **resolve duplicatas** do Blender (`obstacle_5_007` → canônico
   `obstacle_5_001.glb`); anexa script de gameplay por categoria (hazard→`Perigo`,
   trampoline→`Trampolim`, checkpoint→`Checkpoint`, finish→`Chegada`); adiciona
   **coins** na linha de risco (não vêm do mapa), água baixa (respawn) e o player.
   Emite `fase6.data.json` (nós) + `fase6.ts` (fino).
3. **Registrar** em `levels.ts`/`worlds.ts` + overlay vazio `{version:1,objects:{}}`.
4. **Validar em camadas** (typecheck; Vite 200 no módulo; **todo URL de asset existe**
   — um 404 trava o `buildScene`).

Gotchas do porter:
- **Conversão Z-up→Y-up é MUDANÇA DE BASE (conjugação), não left-multiply.** Os GLBs
  do kit já foram exportados em Y-up, então o -90°X é do SISTEMA DE COORDENADAS, não da
  peça. Use `C @ matrix_world @ C⁻¹` (`C = Rotation(-90°, X)`). Se usar só `C @ M`, o
  -90°X **vaza pra rotação de CADA peça** → tudo tomba/flutua (sintoma: 100% do chão com
  `rotX = -1.5708`). Diagnóstico rápido: peça de chão plana deve sair `rot=[0,θ,0]`.
- **Chão contínuo ≠ plataformas**: se o mapa é terreno (grama/terra contínua, não
  plataformas com vãos), o piso é o PRÓPRIO mesh (o character raycasta) — não invente
  plataformas por cima. Se for course de plataformas com vãos, aí sim gere plataformas.
- **Pivô da peça avulsa vs. instância montada** pode divergir (asset do kit exportado
  com origem diferente) → conferir no Studio; é o playtest visual do usuário.
- **Fidelidade custa draw calls**: um mapa inteiro pode ter ~2000 nós → pesado (pior no
  export nativo). Se travar, mesclar decor por material ou fatiar por checkpoint.
- **Fonte = `.blend`, não `.glb`** quando divergirem: o `.blend` costuma ser mais novo e
  tem as coleções (separa nível do showroom).

## Checklist antes de dizer "mapa pronto"

- [ ] Curva de tensão visível: intro calma-bonita → clímax austero-difícil → finish seguro-bonito.
- [ ] Chão ondula; seção mais difícil numa elevação estreita.
- [ ] Pista afunila nos picos, alarga nos respiros.
- [ ] Hazards em clusters (~2 m) com gaps de respiro reais entre eles.
- [ ] Decor com rotação/escala randomizada e espelhada; gameplay eixo-alinhado e uniforme.
- [ ] Paleta coesa; emissão só em coin/checkpoint/finish.
- [ ] Cerca emoldura toda a pista; profundidade em camadas; nenhum hazard camuflado.
- [ ] ~1 checkpoint a cada 30–40 m; dificuldade sobe degrau a cada trecho.
- [ ] Física declarada nos nós (regra do projeto), não cravada em código.

Fechar seguindo a Fase 7 da `montar-jogo` (validar em camadas, commits pt-BR, memória/ADR).
